export function isOwnerEmail(email: string, ownerEmail: string | undefined): boolean {
  if (!ownerEmail) return false;
  return email.toLowerCase() === ownerEmail.toLowerCase();
}
