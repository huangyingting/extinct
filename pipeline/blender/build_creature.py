"""Blender build for the non-dinosaur reptiles (pterosaur, mosasaur, champsosaur, crocodilian).

Run through pipeline/build-assets.mjs, or directly:
    blender -b --python pipeline/blender/build_creature.py -- <job> <source> <out.glb> <report.json>

Jobs (see CREATURES):
  azhdarchid      rigged source: re-orient, scale to wingspan, decimate, keep its flap clip and
                  author a gliding clip
  mosasaur,       unrigged sources: re-orient, scale to length, decimate, then build a spine
  champsosaurus,  chain along the body axis, skin it by axial position, and author Swim and
  alligator       Idle clips (a travelling wave that grows towards the tail)

Conventions follow build_asset.py: animals face -Y in Blender so the glTF exporter writes them
facing +Z (three.js), feet or body centreline at the origin.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(__file__))
import build_asset as ba  # noqa: E402

FPS = ba.FPS
FORWARD, UP = ba.FORWARD, ba.UP
RIGHT = FORWARD.cross(UP)


def import_clean(path):
    ba.reset()
    bpy.ops.import_scene.gltf(filepath=path)
    for obj in list(bpy.context.scene.objects):
        if obj.type in {'LIGHT', 'CAMERA'} or obj.name.startswith(('Icosphere', 'Lamp', 'Camera')):
            bpy.data.objects.remove(obj, do_unlink=True)
    ba.normalise_materials()
    return ba.make_root()


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def apply_root_transform(root):
    """Bake every transform into the meshes: each mesh keeps its world placement, loses its parent
    and ends with an identity transform, so later steps work in metres on Blender axes. The empty
    hierarchy that Sketchfab exports (often with centimetre scales) is then deleted."""
    bpy.context.view_layer.update()
    for obj in meshes():
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == 'MESH')
    bpy.context.view_layer.objects.active = meshes()[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'EMPTY':
            bpy.data.objects.remove(obj, do_unlink=True)


def join_and_weld(distance=1e-4):
    """Join meshes that share one material set and weld their seams. Sources split into 65k-vertex
    chunks tear apart along the chunk seams if each chunk is decimated on its own."""
    parts = meshes()
    if len(parts) < 2:
        return
    for obj in bpy.context.scene.objects:
        obj.select_set(obj in parts)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=distance)
    bpy.ops.object.mode_set(mode='OBJECT')


def decimate_to(target_triangles):
    total = ba.triangle_count()
    if total > target_triangles:
        ba.decimate(target_triangles / total)


def orient_and_scale(root, rotation_deg, size_axis, size):
    root.rotation_euler = Euler([math.radians(a) for a in rotation_deg], 'XYZ')
    bpy.context.view_layer.update()
    lo, hi = ba.mesh_bounds()
    extent = {'x': hi.x - lo.x, 'y': hi.y - lo.y, 'z': hi.z - lo.z}[size_axis]
    root.scale = (size / extent,) * 3
    bpy.context.view_layer.update()


# --------------------------------------------------------------------------- spine rig for swimmers

def axial_profile(slices):
    """Body centreline: for each slice along Y, the mean X/Z of the vertices in it."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in meshes():
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        points.extend(obj.matrix_world @ v.co for v in mesh.vertices)
        evaluated.to_mesh_clear()
    lo = min(p.y for p in points)
    hi = max(p.y for p in points)
    sums = [[0.0, 0.0, 0] for _ in range(slices)]
    for p in points:
        i = min(slices - 1, int((p.y - lo) / (hi - lo) * slices))
        sums[i][0] += p.x
        sums[i][1] += p.z
        sums[i][2] += 1
    centre = []
    for i, (sx, sz, n) in enumerate(sums):
        y = lo + (i + 0.5) / slices * (hi - lo)
        centre.append(Vector((sx / n, y, sz / n)) if n else None)
    # Fill empty slices from neighbours.
    for i, c in enumerate(centre):
        if c is None:
            near = next(centre[j] for j in sorted(range(slices), key=lambda j: abs(j - i)) if centre[j] is not None)
            centre[i] = Vector((near.x, lo + (i + 0.5) / slices * (hi - lo), near.z))
    return lo, hi, centre


def build_spine(segments, pivot_fraction):
    """Armature with a root at the shoulders, a short chain forward to the snout and a long chain
    back to the tail tip. Returns the armature and an ordered list of (bone name, y0, y1) spans."""
    lo, hi, centre = axial_profile(segments * 3)

    def at(y):
        t = (y - lo) / (hi - lo) * len(centre) - 0.5
        i = max(0, min(len(centre) - 2, int(math.floor(t))))
        f = max(0.0, min(1.0, t - i))
        return centre[i].lerp(centre[i + 1], f)

    ys = [lo + (hi - lo) * k / segments for k in range(segments + 1)]  # snout (lo) to tail (hi)
    pivot = max(1, min(segments - 2, round(segments * pivot_fraction)))
    data = bpy.data.armatures.new('Spine')
    armature = bpy.data.objects.new('Spine', data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    spans = []
    root = data.edit_bones.new('spine_00')
    root.head, root.tail = at(ys[pivot]), at(ys[pivot + 1])
    spans.append(('spine_00', ys[pivot], ys[pivot + 1]))
    parent = root
    for k in range(pivot + 1, segments):
        bone = data.edit_bones.new(f'tail_{k - pivot:02d}')
        bone.head, bone.tail = at(ys[k]), at(ys[k + 1])
        bone.parent = parent
        bone.use_connect = True
        spans.append((bone.name, ys[k], ys[k + 1]))
        parent = bone
    parent = root
    for k in range(pivot, 0, -1):
        bone = data.edit_bones.new(f'neck_{pivot - k + 1:02d}')
        bone.head, bone.tail = at(ys[k]), at(ys[k - 1])
        bone.parent = parent
        spans.append((bone.name, ys[k - 1], ys[k]))
        parent = bone
    bpy.ops.object.mode_set(mode='OBJECT')
    return armature, sorted(spans, key=lambda s: s[1])


def skin_by_axis(armature, spans):
    """Weights from axial position: each vertex blends the two spans nearest to it along the body."""
    centres = [((y0 + y1) / 2, name) for name, y0, y1 in spans]
    for obj in meshes():
        for _, name in centres:
            if name not in obj.vertex_groups:
                obj.vertex_groups.new(name=name)
        groups = {name: obj.vertex_groups[name] for _, name in centres}
        for v in obj.data.vertices:
            y = (obj.matrix_world @ v.co).y
            if y <= centres[0][0]:
                groups[centres[0][1]].add([v.index], 1.0, 'REPLACE')
                continue
            if y >= centres[-1][0]:
                groups[centres[-1][1]].add([v.index], 1.0, 'REPLACE')
                continue
            for (ya, a), (yb, b) in zip(centres, centres[1:]):
                if ya <= y <= yb:
                    t = (y - ya) / (yb - ya)
                    t = t * t * (3 - 2 * t)
                    groups[a].add([v.index], 1.0 - t, 'REPLACE')
                    groups[b].add([v.index], t, 'REPLACE')
                    break
        modifier = obj.modifiers.new('Armature', 'ARMATURE')
        modifier.object = armature
        world = obj.matrix_world.copy()
        obj.parent = armature
        obj.matrix_world = world


def swim_clips(rig, spans, style):
    """Travelling-wave swimming. `style` sets where the wave lives: 'tail' (mosasaur, crocodilian:
    body fairly stiff, tail sweeps) or 'body' (champsosaur: whole trunk undulates)."""
    tail = [name for name, *_ in spans if name.startswith('tail_')]
    neck = [name for name, *_ in spans if name.startswith('neck_')]
    n = len(tail)
    amplitude = 34.0 if style == 'tail' else 30.0

    def wave(t, p, cycles, scale, lag=0.9):
        pose = {}
        for i, bone in enumerate(tail):
            s = (i + 1) / n
            gain = (s ** 2.2) if style == 'tail' else (0.25 + 0.75 * s)
            pose[bone] = [(UP, scale * amplitude / n * 2.2 * gain * ba.sin(p, cycles, -lag * i))]
        # The head yaws slightly against the tail to stay on course.
        for i, bone in enumerate(neck):
            pose[bone] = [(UP, -scale * 2.5 * ba.sin(p, cycles, 0.6))]
        pose['spine_00'] = [(UP, scale * 1.5 * ba.sin(p, cycles, 0.3))]
        return pose

    def swim(t, p):
        return wave(t, p, 2, 1.0)

    def idle(t, p):
        # Floating: a slow, small sway and a gentle rise and fall of the head.
        pose = wave(t, p, 1, 0.22, lag=0.5)
        for bone in neck:
            pose[bone].append((RIGHT, 2.0 * ba.sin(p, 1, 1.0)))
        return pose

    return [('Swim', 2.0, swim), ('Idle', 6.0, idle)]


def build_swimmer(source, out, config):
    root = import_clean(source)
    orient_and_scale(root, config['rotate'], 'y', config['length'])
    apply_root_transform(root)
    decimate_to(config['triangles'])
    # Centre: snout-to-tail along Y centred on the origin, body centreline at z = 0.
    lo, hi = ba.mesh_bounds()
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2 + config.get('lift', 0.0)))
    for obj in meshes():
        obj.location -= shift
    apply_root_transform(None)

    armature, spans = build_spine(config['segments'], config['pivot'])
    skin_by_axis(armature, spans)
    rig = ba.Rig(armature)
    clips = [ba.authored_clip(rig, name, seconds, fn) for name, seconds, fn in swim_clips(rig, spans, config['style'])]
    ba.stash(armature, clips)
    for action in clips:
        action.use_fake_user = True
    lo, hi = ba.mesh_bounds()
    ba.clear_pose(armature)
    ba.export(out, animations=True)
    return {
        'length': round(hi.y - lo.y, 2),
        'height': round(hi.z - lo.z, 2),
        'width': round(hi.x - lo.x, 2),
        'clips': {a.name: round((a.frame_range[1] - a.frame_range[0]) / FPS, 3) for a in clips},
        'triangles': ba.triangle_count(),
        'bones': len(armature.data.bones),
    }


# --------------------------------------------------------------------------- pterosaur

def build_flyer(source, out, config):
    root = import_clean(source)
    armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    source_action = armature.animation_data.action if armature.animation_data else None
    imported_pose = ba.capture_pose(armature)
    ba.clear_pose(armature)
    orient_and_scale(root, config['rotate'], 'x', config['wingspan'])
    join_and_weld(1e-3)
    decimate_to(config['triangles'])
    lo, hi = ba.mesh_bounds()
    root.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2))
    bpy.context.view_layer.update()

    # The source clip starts in an upright take-off pose and then flies level with irregular
    # strokes. Find one clean stroke (between successive wing-tip highs, measured relative to the
    # body) for the Flap loop, and a frame with the wings level for the Glide pose.
    scene = bpy.context.scene
    armature.animation_data.action = source_action
    start, end = (int(v) for v in source_action.frame_range)
    tip = armature.pose.bones[config['wingtip']]
    body = armature.pose.bones[config['body']]
    heights = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        heights.append(((armature.matrix_world @ tip.head).z - (armature.matrix_world @ body.head).z, frame))
    settled = [h for h in heights if h[1] >= start + config['skip']]
    highs = [settled[i] for i in range(1, len(settled) - 1) if settled[i][0] >= settled[i - 1][0] and settled[i][0] > settled[i + 1][0]]
    loop_start, loop_end = highs[0][1], highs[1][1]
    glide_frame = min(settled, key=lambda h: abs(h[0]))[1]
    ba.clear_pose(armature)
    clips = [
        ba.clip_from_source(source_action, 'Flap', loop_start, loop_end, imported_pose),
        ba.clip_from_source(source_action, 'Glide', glide_frame, glide_frame + 1, imported_pose),
    ]
    bpy.data.actions.remove(source_action)
    ba.stash(armature, clips)
    for action in clips:
        action.use_fake_user = True
    lo, hi = ba.mesh_bounds()
    ba.clear_pose(armature)
    ba.export(out, animations=True)
    return {
        'wingspan': round(hi.x - lo.x, 2),
        'length': round(hi.y - lo.y, 2),
        'height': round(hi.z - lo.z, 2),
        'clips': {a.name: round((a.frame_range[1] - a.frame_range[0]) / FPS, 3) for a in clips},
        'flapFrames': [loop_start, loop_end],
        'glideFrame': glide_frame,
        'triangles': ba.triangle_count(),
    }


CREATURES = {
    # Source stands upright (head +Z, belly +Y): turn the head to -Y and the back to +Z.
    # The head already faces -Y with the crest up; the source flight clip levels the body.
    # Infernodrakon, the Hell Creek azhdarchid, is described as medium-sized; shown at 5 m wingspan.
    'azhdarchid': {
        'kind': 'flyer', 'rotate': (0, 0, 0), 'wingspan': 5.0, 'triangles': 24000,
        'wingtip': 'Bone.001_L.005_08', 'body': 'Bone_01', 'skip': 30,
    },
    # Mosasaurus hoffmannii is usually estimated at 12-17 m; shown at 12 m.
    'mosasaur': {'kind': 'swimmer', 'rotate': (0, 0, 0), 'length': 12.0, 'triangles': 24000, 'segments': 12, 'pivot': 0.3, 'style': 'tail'},
    'champsosaurus': {'kind': 'swimmer', 'rotate': (0, 0, 0), 'length': 1.8, 'triangles': 14000, 'segments': 12, 'pivot': 0.3, 'style': 'body'},
    'alligator': {'kind': 'swimmer', 'rotate': (0, 0, -90), 'length': 2.6, 'triangles': 12000, 'segments': 12, 'pivot': 0.35, 'style': 'tail'},
}


def main():
    job, source, out, report_path = sys.argv[sys.argv.index('--') + 1:][:4]
    config = CREATURES[job]
    report = build_flyer(source, out, config) if config['kind'] == 'flyer' else build_swimmer(source, out, config)
    with open(report_path, 'w') as handle:
        json.dump(report, handle, indent=2)
    print('REPORT', json.dumps(report))


if __name__ == '__main__':
    main()
