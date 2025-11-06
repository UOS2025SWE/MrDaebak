export function formatCardNumber(value: string): string {
  const digitsOnly = value.replace(/\D/g, '').slice(0, 19);
  return digitsOnly.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function validateCardNumber(value: string): boolean {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.length > 0;
}

export function formatExpiryDate(value: string): string {
  const digitsOnly = value.replace(/\D/g, '').slice(0, 4);
  if (digitsOnly.length < 3) {
    return digitsOnly;
  }
  return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
}

export function validateExpiryDate(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;

  const month = Number(match[1]);
  if (month < 1 || month > 12) return false;

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear() % 100; // YY
  const currentMonth = currentDate.getMonth() + 1;
  const year = Number(match[2]);

  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;

  return true;
}

export function formatCVC(value: string): string {
  return value.replace(/\D/g, '').slice(0, 3);
}

export function validateCVC(value: string): boolean {
  return /^\d{3}$/.test(value);
}

