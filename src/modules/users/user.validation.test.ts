import { describe, it, expect } from 'vitest';
import { isValidUsername } from './user.validation.js';

describe('isValidUsername', () => {

  it('no debe permitir que un username comience con un número', () => {
    expect(isValidUsername('1luciano')).toBe(false);
  });

  it('no debe permitir usernames de solamente dos letras', () => {
    expect(isValidUsername('lu')).toBe(false);
  });

  it('no debe permitir que un username comience con signos de pregunta', () => {
    expect(isValidUsername('?luciano')).toBe(false);
    expect(isValidUsername('¿luciano')).toBe(false);
  });

  it('debe aceptar un username válido', () => {
    expect(isValidUsername('luciano')).toBe(true);
  });

});