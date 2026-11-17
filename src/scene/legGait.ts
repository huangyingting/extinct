import { MathUtils, Object3D, Quaternion, Vector3 } from 'three';
import { terrainHeight } from '../world/terrain';

/**
 * Procedural walk with planted feet, for any number of legs.
 *
 * The source Triceratops walk clip barely plants its feet (each foot is in ground contact for
 * only ~10-15% of the cycle, and the front feet sweep back ~2x faster than the hind feet), so at
 * any playback rate some feet skate. This replaces the leg motion while walking: a lateral-sequence
 * walk (LH, LF, RH, RF a quarter cycle apart) with a 65% duty factor. A planted foot stays fixed in
 * the world; a swinging foot travels in an arc to its next landing point on the terrain. Each leg
 * is solved with two-bone IK (upper and lower limb), keeping the knee/elbow in the plane the clip
 * bends it in, and the hand/foot keeps its rest orientation relative to the body.
 */

export interface LegSpec {
  /** Upper limb (hip-knee or shoulder-elbow), lower limb, and the hand/foot bone at the end of the chain. */
  upper: string;
  lower: string;
  end: string;
  /** Bone whose head touches the ground. */
  contact: string;
  /** Phase offset in the gait cycle (0..1). */
  phase: number;
  /** Swing height in metres. */
  lift: number;
}

export interface GaitSpec {
  legs: LegSpec[];
  /** Fraction of the cycle a foot is on the ground. */
  duty: number;
  /** Step frequency (cycles per second) at cruise speed; slower walks take shorter, slower steps. */
  frequency: number;
  cruise: number;
}

interface Leg {
  spec: LegSpec;
  upper: Object3D;
  lower: Object3D;
  end: Object3D;
  contact: Object3D;
  /** Contact point in the animal's frame at rest. */
  restContact: Vector3;
  /** Hand/foot orientation relative to the animal at rest. */
  restEnd: Quaternion;
  planted: Vector3;
  swingFrom: Vector3;
  swingTo: Vector3;
  swinging: boolean;
  foot: Vector3;
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _t = new Vector3();
const _n = new Vector3();
const _v = new Vector3();
const _q = new Quaternion();
const _p = new Quaternion();
const _w = new Quaternion();

/** Apply a world-space rotation to a bone (premultiplied in world space). */
function rotateWorld(bone: Object3D, rotation: Quaternion) {
  bone.parent!.getWorldQuaternion(_p);
  // local' = parent^-1 * R * parent * local
  _w.copy(_p).invert().multiply(rotation).multiply(_p);
  bone.quaternion.premultiply(_w);
}

/** Set a bone's world orientation. */
function setWorldQuaternion(bone: Object3D, world: Quaternion) {
  bone.parent!.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(world));
}

export class LegGait {
  private legs: Leg[] = [];
  private cycle = 0;
  private readonly spec: GaitSpec;

  constructor(model: Object3D, spec: GaitSpec, find: (name: string) => Object3D | null) {
    this.spec = spec;
    model.updateMatrixWorld(true);
    const inverse = new Quaternion();
    model.getWorldQuaternion(inverse).invert();
    for (const legSpec of spec.legs) {
      const [upper, lower, end, contact] = [legSpec.upper, legSpec.lower, legSpec.end, legSpec.contact].map(find);
      if (!upper || !lower || !end || !contact) continue;
      this.legs.push({
        spec: legSpec,
        upper,
        lower,
        end,
        contact,
        restContact: model.worldToLocal(contact.getWorldPosition(new Vector3())),
        restEnd: inverse.clone().multiply(end.getWorldQuaternion(new Quaternion())),
        planted: new Vector3(),
        swingFrom: new Vector3(),
        swingTo: new Vector3(),
        swinging: false,
        foot: new Vector3(),
      });
    }
  }

  get ready() {
    return this.legs.length === this.spec.legs.length;
  }

  /** Step frequency at a given speed (cycles per second); the walk clip's rhythm is synced to it. */
  frequency(speed: number) {
    return this.stepLength(speed).f;
  }

  /** Where a foot would land: under its rest position, advanced by half a stance step. */
  private landing(leg: Leg, body: Object3D, step: number, target: Vector3) {
    target.copy(leg.restContact);
    target.z += step * 0.5;
    body.localToWorld(target);
    target.y = terrainHeight(target.x, target.z) + leg.restContact.y;
    return target;
  }

  private stepLength(speed: number) {
    const { cruise, frequency, duty } = this.spec;
    const f = frequency * (0.6 + 0.4 * Math.min(speed / cruise, 1.3));
    return { f, step: (speed * duty) / f };
  }

  /** Place every foot as if the animal had been walking (call once the body is positioned). */
  reset(body: Object3D, speed: number) {
    const { step } = this.stepLength(Math.max(speed, this.spec.cruise * 0.5));
    for (const leg of this.legs) {
      const phase = (this.cycle + leg.spec.phase) % 1;
      const along = phase < this.spec.duty ? 0.5 - phase / this.spec.duty : 0;
      this.landing(leg, body, step * 2 * along, leg.planted);
      leg.foot.copy(leg.planted);
      leg.swinging = false;
    }
  }

  /**
   * Advance the gait and pose the legs. `weight` blends the IK pose over the clip pose (0 = clip).
   * Must run after the animation mixer has posed the skeleton for this frame.
   */
  update(body: Object3D, speed: number, dt: number, weight: number, turning = false) {
    if (!this.ready) return;
    const { duty } = this.spec;
    // Turning on the spot steps at a slow-walk rhythm with short steps.
    const stepping = speed > 0.06 || turning;
    const { f, step } = this.stepLength(turning ? Math.max(speed, this.spec.cruise * 0.35) : speed);
    const anySwing = this.legs.some((l) => l.swinging);
    // Keep stepping while moving or turning, and let a lifted foot finish its step when stopping.
    if (stepping || anySwing) this.cycle = (this.cycle + f * dt) % 1;

    body.updateMatrixWorld(true);
    for (const leg of this.legs) {
      const phase = (this.cycle + leg.spec.phase) % 1;
      const inSwing = phase >= duty && (stepping || leg.swinging);
      if (inSwing) {
        if (!leg.swinging) {
          leg.swinging = true;
          leg.swingFrom.copy(leg.planted);
        }
        // Re-aim during the swing so the foot lands under the body even while turning.
        this.landing(leg, body, turning && speed < 0.3 ? 0 : step, leg.swingTo);
        const s = MathUtils.clamp((phase - duty) / (1 - duty), 0, 1);
        const e = s * s * (3 - 2 * s);
        leg.foot.lerpVectors(leg.swingFrom, leg.swingTo, e);
        leg.foot.y += Math.sin(Math.PI * s) * leg.spec.lift;
      } else {
        if (leg.swinging) {
          leg.swinging = false;
          leg.planted.copy(leg.swingTo);
        }
        leg.foot.copy(leg.planted);
      }
      if (weight > 0.001) this.solve(leg, body, weight);
    }
  }

  private solve(leg: Leg, body: Object3D, weight: number) {
    const { upper, lower, end, contact } = leg;
    const before = [upper.quaternion.clone(), lower.quaternion.clone(), end.quaternion.clone()];

    // Target for the end bone: the foot target minus the end->contact offset at the rest orientation.
    body.getWorldQuaternion(_q);
    const endWorld = _q.clone().multiply(leg.restEnd);
    setWorldQuaternion(end, endWorld);
    end.getWorldPosition(_c);
    contact.getWorldPosition(_v);
    _t.copy(leg.foot).sub(_v.sub(_c));

    upper.getWorldPosition(_a);
    lower.getWorldPosition(_b);
    end.getWorldPosition(_c);
    const ab = _a.distanceTo(_b);
    const bc = _b.distanceTo(_c);
    const reach = MathUtils.clamp(_a.distanceTo(_t), Math.abs(ab - bc) + 1e-3, ab + bc - 1e-3);

    // Bend the middle joint to the angle that makes the chain the required length.
    const ba = _v.copy(_a).sub(_b).normalize();
    const bcDir = _n.copy(_c).sub(_b).normalize();
    const current = Math.acos(MathUtils.clamp(ba.dot(bcDir), -1, 1));
    const wanted = Math.acos(MathUtils.clamp((ab * ab + bc * bc - reach * reach) / (2 * ab * bc), -1, 1));
    const axis = new Vector3().crossVectors(ba, bcDir);
    if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0).applyQuaternion(_q);
    axis.normalize();
    rotateWorld(lower, _w.setFromAxisAngle(axis, wanted - current).clone());

    // Swing the upper limb so the chain points at the target.
    end.getWorldPosition(_c);
    const from = _v.copy(_c).sub(_a).normalize();
    const to = _n.copy(_t).sub(_a).normalize();
    rotateWorld(upper, new Quaternion().setFromUnitVectors(from, to));

    // Keep the hand/foot at its rest orientation relative to the body.
    setWorldQuaternion(end, endWorld);

    if (weight < 0.999) {
      upper.quaternion.copy(before[0].slerp(upper.quaternion, weight));
      lower.quaternion.copy(before[1].slerp(lower.quaternion, weight));
      end.quaternion.copy(before[2].slerp(end.quaternion, weight));
    }
  }
}
