/**
 * Lightweight deterministic-ish 3D physics for small arcade games.
 *
 * Scope: axis-aligned boxes only. There is no angular motion, sleeping, joints,
 * mesh collision, or continuous collision detection. Physics owns body positions;
 * a renderer adapter should copy them to visuals after update().
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type BodyKind = 'static' | 'dynamic' | 'kinematic';

export interface PhysicsBodyOptions {
  kind?: BodyKind;
  position: Vec3;
  halfExtents: Vec3;
  velocity?: Vec3;
  mass?: number;
  restitution?: number;
  friction?: number;
  gravityScale?: number;
  linearDamping?: number;
  isTrigger?: boolean;
  layer?: number;
  mask?: number;
  userData?: unknown;
}

export interface PhysicsWorldOptions {
  gravity?: Vec3;
  fixedDelta?: number;
  maxSubSteps?: number;
  maxFrameDelta?: number;
  positionCorrection?: number;
  penetrationSlop?: number;
}

export interface Contact {
  a: PhysicsBody;
  b: PhysicsBody;
  /** Unit normal pointing from body a toward body b. */
  normal: Vec3;
  penetration: number;
  isTrigger: boolean;
}

export interface StepResult {
  steps: number;
  /** Remaining fixed-step fraction, useful for optional visual interpolation. */
  alpha: number;
}

const EPSILON = 1e-8;

function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

function copyVec3(value: Vec3): Vec3 {
  return vec3(value.x, value.y, value.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertFiniteVec3(label: string, value: Vec3): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite numbers`);
  }
}

export class PhysicsBody {
  readonly id: number;
  readonly kind: BodyKind;
  position: Vec3;
  velocity: Vec3;
  halfExtents: Vec3;
  inverseMass: number;
  restitution: number;
  friction: number;
  gravityScale: number;
  linearDamping: number;
  isTrigger: boolean;
  layer: number;
  mask: number;
  userData: unknown;
  enabled = true;
  grounded = false;

  constructor(id: number, options: PhysicsBodyOptions) {
    assertFiniteVec3('position', options.position);
    assertFiniteVec3('halfExtents', options.halfExtents);
    if (options.halfExtents.x <= 0 || options.halfExtents.y <= 0 || options.halfExtents.z <= 0) {
      throw new Error('halfExtents must be greater than zero on every axis');
    }

    this.id = id;
    this.kind = options.kind ?? 'static';
    this.position = copyVec3(options.position);
    this.velocity = copyVec3(options.velocity ?? vec3());
    this.halfExtents = copyVec3(options.halfExtents);

    const mass = options.mass ?? 1;
    if (this.kind === 'dynamic' && (!Number.isFinite(mass) || mass <= 0)) {
      throw new Error('dynamic body mass must be a finite number greater than zero');
    }
    this.inverseMass = this.kind === 'dynamic' ? 1 / mass : 0;
    this.restitution = clamp(options.restitution ?? 0, 0, 1);
    this.friction = Math.max(0, options.friction ?? 0.8);
    this.gravityScale = options.gravityScale ?? 1;
    this.linearDamping = Math.max(0, options.linearDamping ?? 0.02);
    this.isTrigger = options.isTrigger ?? false;
    this.layer = options.layer ?? 1;
    this.mask = options.mask ?? 0xffffffff;
    this.userData = options.userData;
  }

  setVelocity(x: number, y: number, z: number): void {
    this.velocity.x = x;
    this.velocity.y = y;
    this.velocity.z = z;
  }

  applyImpulse(impulse: Vec3): void {
    if (this.kind !== 'dynamic') return;
    this.velocity.x += impulse.x * this.inverseMass;
    this.velocity.y += impulse.y * this.inverseMass;
    this.velocity.z += impulse.z * this.inverseMass;
  }
}

export class PhysicsWorld {
  readonly gravity: Vec3;
  readonly fixedDelta: number;
  readonly maxSubSteps: number;
  readonly maxFrameDelta: number;
  readonly positionCorrection: number;
  readonly penetrationSlop: number;

  contacts: Contact[] = [];

  private readonly bodyList: PhysicsBody[] = [];
  private nextBodyId = 1;
  private accumulator = 0;

  constructor(options: PhysicsWorldOptions = {}) {
    this.gravity = copyVec3(options.gravity ?? vec3(0, -9.81, 0));
    this.fixedDelta = options.fixedDelta ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 5;
    this.maxFrameDelta = options.maxFrameDelta ?? 0.1;
    this.positionCorrection = clamp(options.positionCorrection ?? 0.8, 0, 1);
    this.penetrationSlop = Math.max(0, options.penetrationSlop ?? 0.001);

    if (this.fixedDelta <= 0 || !Number.isFinite(this.fixedDelta)) {
      throw new Error('fixedDelta must be a finite number greater than zero');
    }
    if (!Number.isInteger(this.maxSubSteps) || this.maxSubSteps < 1) {
      throw new Error('maxSubSteps must be an integer greater than zero');
    }
  }

  get bodies(): readonly PhysicsBody[] {
    return this.bodyList;
  }

  addBody(options: PhysicsBodyOptions): PhysicsBody {
    const body = new PhysicsBody(this.nextBodyId++, options);
    this.bodyList.push(body);
    return body;
  }

  removeBody(bodyOrId: PhysicsBody | number): boolean {
    const id = typeof bodyOrId === 'number' ? bodyOrId : bodyOrId.id;
    const index = this.bodyList.findIndex((body) => body.id === id);
    if (index < 0) return false;
    this.bodyList.splice(index, 1);
    this.contacts = this.contacts.filter((contact) => contact.a.id !== id && contact.b.id !== id);
    return true;
  }

  clear(): void {
    this.bodyList.length = 0;
    this.contacts = [];
    this.accumulator = 0;
  }

  /** Advance using a render-frame delta while simulating fixed-size steps. */
  update(frameDelta: number): StepResult {
    if (!Number.isFinite(frameDelta) || frameDelta < 0) {
      throw new Error('frameDelta must be a finite number greater than or equal to zero');
    }

    this.contacts = [];
    this.accumulator += Math.min(frameDelta, this.maxFrameDelta);
    let steps = 0;

    while (this.accumulator >= this.fixedDelta && steps < this.maxSubSteps) {
      this.simulate(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
      steps += 1;
    }

    if (steps === this.maxSubSteps && this.accumulator >= this.fixedDelta) {
      this.accumulator %= this.fixedDelta;
    }

    return { steps, alpha: this.accumulator / this.fixedDelta };
  }

  /** Advance exactly once; useful for deterministic tests and server simulation. */
  step(delta = this.fixedDelta): void {
    if (!Number.isFinite(delta) || delta <= 0) {
      throw new Error('delta must be a finite number greater than zero');
    }
    this.contacts = [];
    this.simulate(delta);
  }

  private simulate(delta: number): void {
    for (const body of this.bodyList) {
      body.grounded = false;
      if (!body.enabled || body.kind === 'static') continue;

      if (body.kind === 'dynamic') {
        body.velocity.x += this.gravity.x * body.gravityScale * delta;
        body.velocity.y += this.gravity.y * body.gravityScale * delta;
        body.velocity.z += this.gravity.z * body.gravityScale * delta;
        const damping = Math.exp(-body.linearDamping * delta);
        body.velocity.x *= damping;
        body.velocity.y *= damping;
        body.velocity.z *= damping;
      }

      body.position.x += body.velocity.x * delta;
      body.position.y += body.velocity.y * delta;
      body.position.z += body.velocity.z * delta;
    }

    const stepContacts: Contact[] = [];
    for (let i = 0; i < this.bodyList.length; i += 1) {
      const a = this.bodyList[i]!;
      if (!a.enabled) continue;

      for (let j = i + 1; j < this.bodyList.length; j += 1) {
        const b = this.bodyList[j]!;
        if (!b.enabled || !this.layersCanCollide(a, b)) continue;
        if (a.inverseMass === 0 && b.inverseMass === 0 && !a.isTrigger && !b.isTrigger) continue;

        const contact = this.findAabbContact(a, b);
        if (!contact) continue;
        stepContacts.push(contact);

        if (!contact.isTrigger) {
          this.markGrounded(contact);
          this.resolveContact(contact);
        }
      }
    }

    // Keep the most recent fixed step. Gameplay can compare body-pair IDs across frames
    // to derive enter/stay/exit events.
    this.contacts = stepContacts;
  }

  private layersCanCollide(a: PhysicsBody, b: PhysicsBody): boolean {
    return (a.mask & b.layer) !== 0 && (b.mask & a.layer) !== 0;
  }

  private findAabbContact(a: PhysicsBody, b: PhysicsBody): Contact | null {
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dz = b.position.z - a.position.z;
    const overlapX = a.halfExtents.x + b.halfExtents.x - Math.abs(dx);
    const overlapY = a.halfExtents.y + b.halfExtents.y - Math.abs(dy);
    const overlapZ = a.halfExtents.z + b.halfExtents.z - Math.abs(dz);

    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return null;

    let penetration = overlapX;
    const normal = vec3(dx >= 0 ? 1 : -1, 0, 0);
    if (overlapY < penetration) {
      penetration = overlapY;
      normal.x = 0;
      normal.y = dy >= 0 ? 1 : -1;
    }
    if (overlapZ < penetration) {
      penetration = overlapZ;
      normal.x = 0;
      normal.y = 0;
      normal.z = dz >= 0 ? 1 : -1;
    }

    return {
      a,
      b,
      normal,
      penetration,
      isTrigger: a.isTrigger || b.isTrigger,
    };
  }

  private markGrounded(contact: Contact): void {
    if (contact.a.kind === 'dynamic' && contact.normal.y < -0.5) contact.a.grounded = true;
    if (contact.b.kind === 'dynamic' && contact.normal.y > 0.5) contact.b.grounded = true;
  }

  private resolveContact(contact: Contact): void {
    const { a, b, normal } = contact;
    const invA = a.kind === 'dynamic' ? a.inverseMass : 0;
    const invB = b.kind === 'dynamic' ? b.inverseMass : 0;
    const inverseMassSum = invA + invB;
    if (inverseMassSum <= EPSILON) return;

    const correctionMagnitude =
      (Math.max(contact.penetration - this.penetrationSlop, 0) * this.positionCorrection) /
      inverseMassSum;
    a.position.x -= normal.x * correctionMagnitude * invA;
    a.position.y -= normal.y * correctionMagnitude * invA;
    a.position.z -= normal.z * correctionMagnitude * invA;
    b.position.x += normal.x * correctionMagnitude * invB;
    b.position.y += normal.y * correctionMagnitude * invB;
    b.position.z += normal.z * correctionMagnitude * invB;

    let relativeX = b.velocity.x - a.velocity.x;
    let relativeY = b.velocity.y - a.velocity.y;
    let relativeZ = b.velocity.z - a.velocity.z;
    const normalSpeed = relativeX * normal.x + relativeY * normal.y + relativeZ * normal.z;
    if (normalSpeed >= 0) return;

    const restitution = Math.min(a.restitution, b.restitution);
    const normalImpulseMagnitude = (-(1 + restitution) * normalSpeed) / inverseMassSum;
    const impulseX = normal.x * normalImpulseMagnitude;
    const impulseY = normal.y * normalImpulseMagnitude;
    const impulseZ = normal.z * normalImpulseMagnitude;
    a.velocity.x -= impulseX * invA;
    a.velocity.y -= impulseY * invA;
    a.velocity.z -= impulseZ * invA;
    b.velocity.x += impulseX * invB;
    b.velocity.y += impulseY * invB;
    b.velocity.z += impulseZ * invB;

    relativeX = b.velocity.x - a.velocity.x;
    relativeY = b.velocity.y - a.velocity.y;
    relativeZ = b.velocity.z - a.velocity.z;
    const tangentDot = relativeX * normal.x + relativeY * normal.y + relativeZ * normal.z;
    let tangentX = relativeX - normal.x * tangentDot;
    let tangentY = relativeY - normal.y * tangentDot;
    let tangentZ = relativeZ - normal.z * tangentDot;
    const tangentLength = Math.hypot(tangentX, tangentY, tangentZ);
    if (tangentLength <= EPSILON) return;

    tangentX /= tangentLength;
    tangentY /= tangentLength;
    tangentZ /= tangentLength;
    const rawFrictionImpulse =
      -(relativeX * tangentX + relativeY * tangentY + relativeZ * tangentZ) / inverseMassSum;
    const friction = Math.sqrt(a.friction * b.friction);
    const frictionImpulseMagnitude = clamp(
      rawFrictionImpulse,
      -normalImpulseMagnitude * friction,
      normalImpulseMagnitude * friction,
    );
    const frictionX = tangentX * frictionImpulseMagnitude;
    const frictionY = tangentY * frictionImpulseMagnitude;
    const frictionZ = tangentZ * frictionImpulseMagnitude;
    a.velocity.x -= frictionX * invA;
    a.velocity.y -= frictionY * invA;
    a.velocity.z -= frictionZ * invA;
    b.velocity.x += frictionX * invB;
    b.velocity.y += frictionY * invB;
    b.velocity.z += frictionZ * invB;
  }
}
