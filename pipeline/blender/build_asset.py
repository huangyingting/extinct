"""Blender asset build for the Extinct prototype.

Run through pipeline/build-assets.mjs, or directly:
    blender -b --python pipeline/blender/build_asset.py -- <job> <source> <out.glb> <report.json>

Jobs:
  trex, triceratops  normalise a rigged reconstruction to real-world scale, keep
                     its source walk loop and author additional clips
  fossil             decimate the Smithsonian CC0 fossil-mount scan
  prop:<ratio>       generic static model, optionally decimated to <ratio>

Conventions: Blender is Z-up; animals are turned to face -Y so that the glTF
exporter writes them facing +Z, the three.js convention for Object3D.lookAt.
"""
import json
import math
import sys

import bpy
from mathutils import Quaternion, Vector

FPS = 24
FORWARD = Vector((0, -1, 0))
UP = Vector((0, 0, 1))
RIGHT = FORWARD.cross(UP)  # rotating +angle about RIGHT pitches the nose up


# --------------------------------------------------------------------------- scene helpers

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def import_model(path):
    bpy.ops.import_scene.gltf(filepath=path)
    for obj in list(bpy.context.scene.objects):
        if obj.type in {'LIGHT', 'CAMERA'} or obj.name.startswith(('Icosphere', 'Lamp')):
            bpy.data.objects.remove(obj, do_unlink=True)
    normalise_materials()


def normalise_materials():
    """Make every material exportable as plain glTF metallic-roughness.

    Spec-gloss sources import as Diffuse + Glossy nodes, which the Blender 4.0
    exporter silently drops; rebuild those as Principled BSDF. Emission maps on
    the creature sources make them glow under scene lighting, so remove them.
    """
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        tree = material.node_tree
        principled = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if principled is None:
            output = next((n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
            diffuse = next((n for n in tree.nodes if n.type == 'BSDF_DIFFUSE'), None)
            glossy = next((n for n in tree.nodes if n.type == 'BSDF_GLOSSY'), None)
            if output is None or diffuse is None:
                continue
            principled = tree.nodes.new('ShaderNodeBsdfPrincipled')

            def carry(source, target):
                if source.is_linked:
                    tree.links.new(source.links[0].from_socket, target)
                else:
                    target.default_value = source.default_value

            carry(diffuse.inputs['Color'], principled.inputs['Base Color'])
            normal_source = diffuse if diffuse.inputs['Normal'].is_linked else glossy
            if normal_source is not None and normal_source.inputs['Normal'].is_linked:
                tree.links.new(normal_source.inputs['Normal'].links[0].from_socket, principled.inputs['Normal'])
            if glossy is not None:
                carry(glossy.inputs['Roughness'], principled.inputs['Roughness'])
            principled.inputs['Metallic'].default_value = 0.0
            tree.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
        for link in list(principled.inputs['Emission Color'].links):
            tree.links.remove(link)
        principled.inputs['Emission Color'].default_value = (0, 0, 0, 1)
        principled.inputs['Emission Strength'].default_value = 0.0


def make_root():
    """Parent every top-level object under one empty that carries the normalising transform."""
    root = bpy.data.objects.new('Root', None)
    bpy.context.scene.collection.objects.link(root)
    for obj in bpy.context.scene.objects:
        if obj.parent is None and obj is not root:
            obj.parent = root
    return root


def mesh_bounds():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        matrix = evaluated.matrix_world
        for vertex in mesh.vertices:
            p = matrix @ vertex.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        evaluated.to_mesh_clear()
    return lo, hi


def triangle_count():
    return sum(
        sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
        for obj in bpy.context.scene.objects if obj.type == 'MESH'
    )


def decimate(ratio):
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or ratio >= 1:
            continue
        modifier = obj.modifiers.new('decimate', 'DECIMATE')
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def export(path, animations):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=False,
        export_animations=animations,
        export_animation_mode='ACTIONS' if animations else 'ACTIVE_ACTIONS',
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_lights=False,
        export_cameras=False,
    )


# --------------------------------------------------------------------------- animation helpers

class Rig:
    def __init__(self, armature):
        self.armature = armature
        self.world_to_armature = armature.matrix_world.to_3x3().normalized().inverted()

    def local_rotation(self, bone_name, world_axis, degrees):
        """Rotation about a world-space axis expressed in the bone's rest frame."""
        bone = self.armature.data.bones[bone_name]
        axis = bone.matrix_local.to_3x3().inverted() @ (self.world_to_armature @ world_axis)
        return Quaternion(axis.normalized(), math.radians(degrees))

    def pose(self, rotations):
        """rotations: {bone: [(world_axis, degrees), ...]} -> {bone: Quaternion}."""
        result = {}
        for bone_name, parts in rotations.items():
            q = Quaternion()
            for axis, degrees in parts:
                q = self.local_rotation(bone_name, axis, degrees) @ q
            result[bone_name] = q
        return result


def capture_pose(armature):
    """Pose values the glTF importer derived from the node defaults (before any reset)."""
    return {
        pb.name: {
            'location': tuple(pb.location),
            'rotation_quaternion': tuple(pb.rotation_quaternion),
            'scale': tuple(pb.scale),
        }
        for pb in armature.pose.bones
    }


def clip_from_source(source, name, start, end, defaults):
    """Copy [start, end] of a source action into a new action that starts at frame 0.

    Channels the source never animates are keyed with their imported node defaults so
    the exported clip is complete (three.js would otherwise fall back to the bind pose).
    """
    action = bpy.data.actions.new(name)
    frames = range(int(start), int(end) + 1)
    for curve in source.fcurves:
        group = curve.group.name if curve.group else ''
        new = action.fcurves.new(curve.data_path, index=curve.array_index, action_group=group)
        new.keyframe_points.add(len(frames))
        for point, frame in zip(new.keyframe_points, frames):
            point.co = (frame - start, curve.evaluate(frame))
            point.interpolation = 'LINEAR'
    for bone, channels in defaults.items():
        for channel, values in channels.items():
            path = f'pose.bones["{bone}"].{channel}'
            for index, value in enumerate(values):
                if action.fcurves.find(path, index=index) is None:
                    curve = action.fcurves.new(path, index=index, action_group=bone)
                    curve.keyframe_points.insert(0, value)
                    curve.keyframe_points.insert(end - start, value)
    return action


def authored_clip(rig, name, seconds, sample, step=2):
    """Bake sample(t, phase) -> {bone: [(axis, degrees)]} into an action keyed on every bone."""
    action = bpy.data.actions.new(name)
    frames = int(round(seconds * FPS))
    curves = {}
    for pose_bone in rig.armature.pose.bones:
        path = f'pose.bones["{pose_bone.name}"].rotation_quaternion'
        curves[pose_bone.name] = [
            action.fcurves.new(path, index=i, action_group=pose_bone.name) for i in range(4)
        ]
    for frame in list(range(0, frames, step)) + [frames]:
        t = frame / FPS
        pose = rig.pose(sample(t, t / seconds))
        for bone_name, fcurves in curves.items():
            q = pose.get(bone_name, Quaternion())
            for i, fcurve in enumerate(fcurves):
                fcurve.keyframe_points.insert(frame, q[i], options={'FAST'})
    for fcurves in curves.values():
        for fcurve in fcurves:
            for point in fcurve.keyframe_points:
                point.interpolation = 'BEZIER'
            fcurve.update()
    return action


def stash(armature, actions):
    """The glTF exporter writes one animation per NLA track."""
    armature.animation_data_create()
    armature.animation_data.action = None
    for track in list(armature.animation_data.nla_tracks):
        armature.animation_data.nla_tracks.remove(track)
    for action in actions:
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(action.frame_range[0]), action)
        track.mute = True


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def envelope(t, keys):
    """Piecewise smooth interpolation through (time, value) keys."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0))
    return keys[-1][1]


def sin(phase, cycles=1, offset=0.0):
    return math.sin(2 * math.pi * cycles * phase + offset)


# --------------------------------------------------------------------------- measurement

def clear_pose(armature):
    """Unassigning an action leaves the last evaluated pose behind; return to the rest pose."""
    armature.animation_data.action = None
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = 'QUATERNION'
        pose_bone.rotation_quaternion = Quaternion()
        pose_bone.location = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def lock_to_ground(armature, action, frames):
    """Per-frame vertical root correction so the lowest point (the stance foot) stays on z=0.

    The source walk loops are in place but their feet are not locked: the lowest
    vertex drifts by roughly +/-0.35 m over a cycle, so the animals would sink and float.
    """
    scene = bpy.context.scene
    armature.animation_data.action = action
    lows = []
    for frame in range(frames + 1):
        scene.frame_set(frame)
        lows.append(mesh_bounds()[0].z)
    clear_pose(armature)

    root_bone = next(b for b in armature.data.bones if b.parent is None)
    to_local = root_bone.matrix_local.to_3x3().inverted() @ armature.matrix_world.to_3x3().inverted()
    path = f'pose.bones["{root_bone.name}"].location'
    for i in range(3):
        curve = action.fcurves.find(path, index=i)
        base = [curve.evaluate(f) if curve else 0.0 for f in range(frames + 1)]
        if curve is None:
            curve = action.fcurves.new(path, index=i, action_group=root_bone.name)
        curve.keyframe_points.clear()
        curve.keyframe_points.add(frames + 1)
        for frame, point in enumerate(curve.keyframe_points):
            point.co = (frame, base[frame] + (to_local @ Vector((0, 0, -lows[frame])))[i])
            point.interpolation = 'LINEAR'
    return max(lows) - min(lows)


def measure_walk_speed(rig, action, frames, feet, forward):
    """In-place walk speed (m/s) from the stance foot's backward travel."""
    scene = bpy.context.scene
    rig.armature.animation_data.action = action
    travel = []
    previous = None
    for frame in range(frames + 1):
        scene.frame_set(frame)
        positions = {f: rig.armature.matrix_world @ rig.armature.pose.bones[f].head for f in feet}
        if previous:
            planted = min(feet, key=lambda f: positions[f].z)
            travel.append(-(positions[planted] - previous[planted]).dot(forward))
        previous = positions
    clear_pose(rig.armature)
    return sum(travel) / len(travel) * FPS


# --------------------------------------------------------------------------- jobs

def build_dinosaur(source, out, config):
    reset()
    import_model(source)
    root = make_root()
    armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    source_action = armature.animation_data.action
    imported_pose = capture_pose(armature)
    clear_pose(armature)

    root.rotation_euler.z = config['turn']
    bpy.context.view_layer.update()
    lo, hi = mesh_bounds()
    root.scale = (config['length'] / (hi.y - lo.y),) * 3
    bpy.context.view_layer.update()

    rig = Rig(armature)
    walk = clip_from_source(source_action, 'Walk', *config['walk'], imported_pose)
    walk_frames = int(config['walk'][1] - config['walk'][0])
    pivot = armature.matrix_world @ armature.pose.bones[config['pivot']].head
    root.location -= Vector((pivot.x, pivot.y, mesh_bounds()[0].z))
    bpy.context.view_layer.update()
    speed = measure_walk_speed(rig, walk, walk_frames, config['feet'], FORWARD)
    walk_drift = lock_to_ground(armature, walk, walk_frames)

    rig = Rig(armature)
    clips = [walk] + [authored_clip(rig, name, seconds, fn) for name, seconds, fn in config['clips'](rig)]
    bpy.data.actions.remove(source_action)  # ship only the curated clips
    stash(armature, clips)
    for action in clips:
        action.use_fake_user = True

    lo, hi = mesh_bounds()
    rig.armature.animation_data.action = walk
    bpy.context.scene.frame_set(0)
    walk_clearance = mesh_bounds()[0].z
    clear_pose(rig.armature)
    export(out, animations=True)
    return {
        'length': round(hi.y - lo.y, 2),
        'height': round(hi.z - lo.z, 2),
        'width': round(hi.x - lo.x, 2),
        'restFootClearance': round(lo.z, 3),
        'walkFootClearance': round(walk_clearance, 3),
        'walkFootDriftCorrected': round(walk_drift, 3),
        'walkSpeed': round(speed * config['speed_scale'], 3),
        'clips': {a.name: round((a.frame_range[1] - a.frame_range[0]) / FPS, 3) for a in clips},
        'triangles': triangle_count(),
    }


def trex_clips(rig):
    tail = [f'T-Rex_Tail{i}_{i + 1:02d}' for i in range(1, 9)]
    # The source rest pose has the jaw wide open; +34 degrees closes it.
    # T-Rex_Spine_020 (neck) pivots near the pelvis, so it only takes small angles.
    jaw_closed = 32

    def idle(t, p):
        pose = {
            'T-Rex_Spine2_012': [(RIGHT, 1.2 * sin(p, 2))],
            'T-Rex_Chest_013': [(RIGHT, 1.0 * sin(p, 2, 0.4))],
            'T-Rex_Spine_020': [(UP, 2.5 * sin(p)), (RIGHT, -0.8 + 0.6 * sin(p, 2, 1))],
            'T-Rex_Head_021': [(UP, 10 * sin(p, 1, -0.7)), (RIGHT, 3 * sin(p, 3)), (FORWARD, 3 * sin(p, 1, 1))],
            'T-Rex_Jew_022': [(RIGHT, jaw_closed - 5 * max(0.0, sin(p, 2, -0.5)))],
            'T-Rex_Pelvis_01': [(FORWARD, 1.0 * sin(p))],
            'T-Rex_RArm1_015': [(RIGHT, 4 * sin(p, 2, 0.8))],
            'T-Rex_LArm1_023': [(RIGHT, 4 * sin(p, 2, 1.1))],
        }
        for i, bone in enumerate(tail):
            pose[bone] = [(UP, (1.2 + 0.7 * i) * sin(p, 1, -0.45 * i)), (RIGHT, 0.8 * sin(p, 2, -0.3 * i))]
        return pose

    def roar(t, p):
        windup = envelope(t, [(0, 0), (0.7, 1), (0.95, 0)])
        lunge = envelope(t, [(0.6, 0), (1.05, 1), (2.7, 1), (3.6, 0)])
        tremble = math.sin(t * 2 * math.pi * 11) * lunge
        sweep = math.sin((t - 1.0) * 2 * math.pi * 0.45) * lunge
        jaw = envelope(t, [(0, jaw_closed), (0.7, jaw_closed + 2), (1.05, -6), (2.7, -4), (3.6, jaw_closed)])
        pose = {
            'T-Rex_Spine2_012': [(RIGHT, 3 * windup - 2 * lunge)],
            'T-Rex_Chest_013': [(RIGHT, 3 * windup - 2 * lunge)],
            'T-Rex_Spine_020': [(RIGHT, 4 * windup - 4 * lunge), (UP, 3 * sweep)],
            'T-Rex_Head_021': [(RIGHT, 12 * windup - 5 * lunge + 0.8 * tremble), (UP, 10 * sweep), (FORWARD, 5 * sweep)],
            'T-Rex_Jew_022': [(RIGHT, jaw + 1.5 * tremble)],
            'T-Rex_Pelvis_01': [(RIGHT, -1.5 * windup + 1.5 * lunge)],
            'T-Rex_RArm1_015': [(RIGHT, 12 * lunge)],
            'T-Rex_LArm1_023': [(RIGHT, 12 * lunge)],
        }
        for i, bone in enumerate(tail):
            pose[bone] = [(RIGHT, -1.0 * windup + (0.8 + 0.4 * i) * lunge), (UP, 0.8 * i * sweep)]
        return pose

    return [('Idle', 8.0, idle), ('Roar', 4.0, roar)]


def triceratops_clips(rig):
    tail = ['Bone.008_Armature', 'Bone.010_Armature', 'Bone.009_Armature', 'Bone.011_Armature']

    def breathing_and_tail(p, pose):
        pose.setdefault('Bone_Armature', []).append((RIGHT, 0.8 * sin(p, 2)))
        for i, bone in enumerate(tail):
            pose[bone] = [(UP, (2 + 1.5 * i) * sin(p, 1, -0.5 * i)), (RIGHT, 1.0 * sin(p, 2, -0.4 * i))]
        return pose

    def graze(t, p):
        reach = 0.75 + 0.25 * sin(p, 2, -1.2)
        pose = {
            'Bone_Armature': [(RIGHT, -3 * reach)],
            'Bone.001_Armature': [(RIGHT, -24 * reach), (UP, 9 * sin(p))],
            'Bone.002_Armature': [(RIGHT, -20 * reach), (UP, 6 * sin(p, 1, -0.6))],
            'Bone.004_Armature': [(RIGHT, 4 - 7 * max(0.0, sin(p, 16)))],
        }
        return breathing_and_tail(p, pose)

    def alert(t, p):
        lift = envelope(t, [(0, 0), (0.6, 1), (3.0, 1), (4.0, 0)])
        look = envelope(t, [(0.4, 0), (1.2, 1), (2.0, 1), (2.6, -0.6), (3.2, -0.6), (4.0, 0)])
        pose = {
            'Bone.001_Armature': [(RIGHT, 9 * lift), (UP, 14 * look)],
            'Bone.002_Armature': [(RIGHT, 5 * lift), (UP, 10 * look)],
            'Bone.004_Armature': [(RIGHT, 4 - 3 * lift)],
        }
        return breathing_and_tail(p, pose)

    return [('Graze', 8.0, graze), ('Alert', 4.0, alert)]


DINOSAURS = {
    'trex': {
        'turn': math.pi,           # source faces +Y
        'length': 12.0,            # metres, typical adult estimate
        'walk': (0, 28),           # clean in-place loop inside the source showcase action
        'pivot': 'T-Rex_Pelvis_01',
        'feet': ['T-Rex_RLegDigit11_032', 'T-Rex_LLegDigit11_038'],
        'speed_scale': 1.0,
        'clips': trex_clips,
    },
    'triceratops': {
        'turn': 0.0,               # source already faces -Y
        'length': 8.5,
        'walk': (1, 79),
        'pivot': 'Bone.006_Armature',
        'feet': ['Bone.029_Armature', 'Bone.031_Armature', 'Bone.028_Armature', 'Bone.030_Armature'],
        'speed_scale': 1.0,
        'clips': triceratops_clips,
    },
}


def build_fossil(source, out):
    reset()
    import_model(source)
    root = make_root()
    before = triangle_count()
    decimate(0.3)
    lo, hi = mesh_bounds()
    centre = (lo + hi) / 2
    root.location -= Vector((centre.x, centre.y, lo.z))
    bpy.context.view_layer.update()
    lo, hi = mesh_bounds()
    export(out, animations=False)
    return {'sourceTriangles': before, 'triangles': triangle_count(), 'size': [round(v, 2) for v in hi - lo]}


def build_prop(source, out, ratio):
    reset()
    import_model(source)
    root = make_root()
    before = triangle_count()
    decimate(ratio)
    lo, hi = mesh_bounds()
    centre = (lo + hi) / 2
    root.location -= Vector((centre.x, centre.y, lo.z))
    bpy.context.view_layer.update()
    lo, hi = mesh_bounds()
    export(out, animations=False)
    return {'sourceTriangles': before, 'triangles': triangle_count(), 'size': [round(v, 2) for v in hi - lo]}


def main():
    job, source, out, report_path = sys.argv[sys.argv.index('--') + 1:][:4]
    if job in DINOSAURS:
        report = build_dinosaur(source, out, DINOSAURS[job])
    elif job == 'fossil':
        report = build_fossil(source, out)
    elif job.startswith('prop'):
        ratio = float(job.split(':')[1]) if ':' in job else 1.0
        report = build_prop(source, out, ratio)
    else:
        raise SystemExit(f'unknown job {job}')
    with open(report_path, 'w') as handle:
        json.dump(report, handle, indent=2)
    print('REPORT', json.dumps(report))


if __name__ == '__main__':
    main()
