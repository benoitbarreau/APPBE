import type { ApprovedProfile } from './types'

// ── Utilitaire SIRET ───────────────────────────────────────────────────────

/** Formate une valeur saisie en SIRET : "XXX XXX XXX XXXXX" (3+3+3+5 chiffres) */
export function formatSiret(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
}

// ── Helpers profil ─────────────────────────────────────────────────────────

export function profileDisplayName(p: ApprovedProfile): string {
  return p.full_name?.trim() || p.email
}

export function profileInitials(p: ApprovedProfile): string {
  const name = p.full_name?.trim()
  if (name) {
    const parts = name.split(/\s+/)
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name[0].toUpperCase()
  }
  return p.email[0].toUpperCase()
}
