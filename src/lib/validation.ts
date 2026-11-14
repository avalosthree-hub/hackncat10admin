export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

export function normalizeLabels(labels: string[]) {
  const unique = new Map<string, string>();
  for (const value of labels) {
    const label = value.trim();
    if (!label) throw new Error("Topic labels cannot be empty.");
    if (label.length > 100) throw new Error("Keep each topic label to 100 characters or fewer.");
    unique.set(label.toLowerCase(), unique.get(label.toLowerCase()) ?? label);
  }
  return [...unique.values()];
}

