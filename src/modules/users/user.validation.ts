export function isValidUsername(username: string): boolean {
  if (username.length <= 2) {
    return false;
  }

  if (/^\d/.test(username)) {
    return false;
  }

  if (/^[?¿]/.test(username)) {
    return false;
  }

  return true;
}