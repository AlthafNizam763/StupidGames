import type { InputSnapshot } from '../engine/types';

/**
 * Input, normalised across devices.
 *
 * Keyboard and joystick both write into one snapshot, so the simulation never
 * knows or cares which produced it. That is what lets the same movement code
 * serve a desktop player on WASD and a phone player with a thumb on glass (§7).
 *
 * The snapshot is a single mutable object reused every frame. Returning a fresh
 * one sixty times a second would hand the garbage collector work it does not
 * need, and this is read-then-discarded within the same tick.
 */

const KEY_BINDINGS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export class InputManager {
  private readonly held = new Set<'up' | 'down' | 'left' | 'right'>();

  /** Set by the on-screen joystick. Null when the thumb is not down. */
  private joystick: { x: number; y: number; magnitude: number } | null = null;

  private interactPressed = false;
  private actionPressed = false;

  private readonly snapshot: InputSnapshot = {
    direction: { x: 0, y: 0 },
    magnitude: 0,
    interact: false,
    action: false,
  };

  private attached = false;

  attach(target: Window = window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.releaseAll);
  }

  detach(target: Window = window): void {
    if (!this.attached) return;
    this.attached = false;
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
    target.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Never steal keys from a text field. Typing "was" in chat must not walk
    // the character across the map.
    if (isTypingTarget(event.target)) return;

    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      this.held.add(binding);
      // Arrow keys scroll the page otherwise, which fights the camera.
      event.preventDefault();
      return;
    }

    if (event.code === 'KeyE') this.interactPressed = true;
    if (event.code === 'Space') {
      this.actionPressed = true;
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const binding = KEY_BINDINGS[event.code];
    if (binding) this.held.delete(binding);
    if (event.code === 'KeyE') this.interactPressed = false;
    if (event.code === 'Space') this.actionPressed = false;
  };

  /**
   * Clears every held key.
   *
   * Without this, alt-tabbing while holding a direction leaves the key stuck
   * down - the browser never delivers the keyup - and the character walks into
   * a wall until the player presses and releases it again.
   */
  private readonly releaseAll = (): void => {
    this.held.clear();
    this.interactPressed = false;
    this.actionPressed = false;
  };

  /** Called by the on-screen joystick. Magnitude 0-1; null lifts the thumb. */
  setJoystick(value: { x: number; y: number; magnitude: number } | null): void {
    this.joystick = value;
  }

  setInteract(pressed: boolean): void {
    this.interactPressed = pressed;
  }

  setAction(pressed: boolean): void {
    this.actionPressed = pressed;
  }

  /** The current input, as one normalised snapshot. */
  read(): InputSnapshot {
    let x = 0;
    let y = 0;
    let magnitude = 0;

    if (this.joystick) {
      // The joystick wins while a thumb is down: a device with both should not
      // have a forgotten key fighting the stick.
      x = this.joystick.x;
      y = this.joystick.y;
      magnitude = this.joystick.magnitude;
    } else {
      if (this.held.has('left')) x -= 1;
      if (this.held.has('right')) x += 1;
      if (this.held.has('up')) y -= 1;
      if (this.held.has('down')) y += 1;

      const length = Math.hypot(x, y);
      if (length > 0) {
        /*
         * Normalised, so diagonals are not faster. Holding W and D would
         * otherwise give a vector of length 1.41 and a player who moves 41%
         * faster on the diagonal - the classic bug, and one the server's speed
         * check would reject as a speed hack.
         */
        x /= length;
        y /= length;
        magnitude = 1;
      }
    }

    this.snapshot.direction.x = x;
    this.snapshot.direction.y = y;
    this.snapshot.magnitude = magnitude;
    this.snapshot.interact = this.interactPressed;
    this.snapshot.action = this.actionPressed;

    return this.snapshot;
  }
}

/** True when the event came from somewhere the player is typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
  );
}
