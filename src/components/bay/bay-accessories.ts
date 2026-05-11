/** Accessoires intégrés de la Baie — câble managers, caches, PDU, etc. */

export interface BayAccessory {
  id: string;
  label: string;
  manufacturer: string;
  reference: string;
  category: string;
  heightU: number;
  widthCols: 1 | 2 | 4;
  color?: string;
}

export const BAY_ACCESSORIES: BayAccessory[] = [
  // ── Caches (blanking panels) ─────────────────────────────────────────────
  { id: 'acc-blank-1u', label: 'Cache 1U', manufacturer: 'Generic', reference: 'Blank Panel 1U', category: 'Cache', heightU: 1, widthCols: 4, color: '#3a3a3a' },
  { id: 'acc-blank-2u', label: 'Cache 2U', manufacturer: 'Generic', reference: 'Blank Panel 2U', category: 'Cache', heightU: 2, widthCols: 4, color: '#3a3a3a' },
  { id: 'acc-blank-4u', label: 'Cache 4U', manufacturer: 'Generic', reference: 'Blank Panel 4U', category: 'Cache', heightU: 4, widthCols: 4, color: '#3a3a3a' },

  // ── Gestion câbles ───────────────────────────────────────────────────────
  { id: 'acc-cable-1u-h', label: 'Gestion câbles horizontale 1U', manufacturer: 'Generic', reference: 'Cable Manager 1U-H', category: 'Gestion câbles', heightU: 1, widthCols: 4, color: '#2d4a6e' },
  { id: 'acc-cable-2u-h', label: 'Gestion câbles horizontale 2U', manufacturer: 'Generic', reference: 'Cable Manager 2U-H', category: 'Gestion câbles', heightU: 2, widthCols: 4, color: '#2d4a6e' },

  // ── Brassage ─────────────────────────────────────────────────────────────
  { id: 'acc-patch-24', label: 'Patch panel 24 ports Cat6', manufacturer: 'Generic', reference: 'Patch 24p 1U', category: 'Brassage', heightU: 1, widthCols: 4, color: '#1a1a2e' },
  { id: 'acc-patch-48', label: 'Patch panel 48 ports Cat6', manufacturer: 'Generic', reference: 'Patch 48p 2U', category: 'Brassage', heightU: 2, widthCols: 4, color: '#1a1a2e' },
  { id: 'acc-patch-fo-12', label: 'Tiroir fibre optique 12 ports', manufacturer: 'Generic', reference: 'FO Drawer 12p 1U', category: 'Brassage', heightU: 1, widthCols: 4, color: '#1a2e1a' },
  { id: 'acc-patch-fo-24', label: 'Tiroir fibre optique 24 ports', manufacturer: 'Generic', reference: 'FO Drawer 24p 1U', category: 'Brassage', heightU: 1, widthCols: 4, color: '#1a2e1a' },

  // ── Alimentation ─────────────────────────────────────────────────────────
  { id: 'acc-pdu-1u', label: 'Multiprise PDU 1U', manufacturer: 'Generic', reference: 'PDU 1U 8 prises', category: 'Alimentation', heightU: 1, widthCols: 4, color: '#6e1a1a' },
  { id: 'acc-pdu-2u', label: 'Multiprise PDU 2U', manufacturer: 'Generic', reference: 'PDU 2U 16 prises', category: 'Alimentation', heightU: 2, widthCols: 4, color: '#6e1a1a' },
  { id: 'acc-ups-2u', label: 'UPS onduleur 2U', manufacturer: 'Generic', reference: 'UPS 2U', category: 'Alimentation', heightU: 2, widthCols: 4, color: '#4a2d00' },

  // ── Ventilation ──────────────────────────────────────────────────────────
  { id: 'acc-fan-1u', label: 'Tiroir ventilateur 1U', manufacturer: 'Generic', reference: 'Fan Tray 1U', category: 'Ventilation', heightU: 1, widthCols: 4, color: '#1a3a1a' },
  { id: 'acc-fan-2u', label: 'Tiroir ventilateur 2U', manufacturer: 'Generic', reference: 'Fan Tray 2U', category: 'Ventilation', heightU: 2, widthCols: 4, color: '#1a3a1a' },

  // ── Tablettes / Chevalets ────────────────────────────────────────────────
  { id: 'acc-shelf-1u', label: 'Tablette fixe 1U', manufacturer: 'Generic', reference: 'Fixed Shelf 1U', category: 'Tablette', heightU: 1, widthCols: 4, color: '#4a4a4a' },
  { id: 'acc-shelf-2u', label: 'Tablette fixe 2U', manufacturer: 'Generic', reference: 'Fixed Shelf 2U', category: 'Tablette', heightU: 2, widthCols: 4, color: '#4a4a4a' },
  { id: 'acc-kvm-1u', label: 'Console KVM 1U', manufacturer: 'Generic', reference: 'KVM Console 1U', category: 'Console', heightU: 1, widthCols: 4, color: '#3a2d4a' },
];
