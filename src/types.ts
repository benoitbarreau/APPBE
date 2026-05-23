export type SignalType = string;

export type PortDirection = "in" | "out" | "bi";

export interface Port {
  id: string;
  label: string;
  signal: SignalType;
  direction: PortDirection;
  /**
   * Élément décoratif inséré dans la liste des ports.
   * - undefined : port normal (avec pastille de connexion sur le bloc)
   * - 'spacer'  : ligne vide servant de saut de ligne — pas de label visible,
   *               pas de pastille de connexion. Disponible dans toutes les
   *               sections (entrées / sorties / milieu).
   * - 'separator' : ligne en pointillés gris foncé sur toute la largeur du
   *               bloc. Disponible UNIQUEMENT dans la section milieu.
   */
  kind?: 'spacer' | 'separator';
}

/** True si le « port » est un élément décoratif (espace ou séparateur). */
export const isDecorativePort = (p: Port): boolean =>
  p.kind === 'spacer' || p.kind === 'separator';

export type RackSize = "19" | "10";
export type RackWidth = "full" | "half" | "quarter";

export interface Product {
  id: string;
  reference: string;
  manufacturer: string;
  category: string;
  inputs: Port[];
  outputs: Port[];
  middle?: Port[];
  articleCode?: string;
  productUrl?: string;
  rackHeightU?: number;
  rackSize?: RackSize;
  rackWidth?: RackWidth;
  imageFront?: string;
  imageBack?: string;
}

export type PortPlacement = "left" | "right" | "middle";

/** ID réservé pour le produit synthétique "Bloc vierge". */
export const BLANK_BLOCK_PRODUCT_ID = "__blank__";

/** Produit synthétique utilisé comme base pour les blocs vierges.
 *  Il n'est jamais stocké dans le catalogue — il est créé à la volée. */
export const BLANK_PRODUCT: Product = {
  id: BLANK_BLOCK_PRODUCT_ID,
  manufacturer: "",
  reference: "",
  category: "",
  inputs: [],
  outputs: [],
  middle: [],
};

export interface PlacedProduct {
  id: string;
  productId: string;
  name: string;
  position: { x: number; y: number };
  zoneId?: string;
  /** Étiquette libre affichée sur le bloc (ex. numéro d'inventaire, nom court). */
  label?: string;
  /** True si le label a été auto-généré à partir de la catégorie produit
   *  et n'a pas encore été modifié manuellement. Affiché en italique non-gras. */
  labelIsAuto?: boolean;
  portOverrides?: Record<string, PortPlacement>;
  portLabelOverrides?: Record<string, string>;
  /** Surcharge du signal par port (instance uniquement, sans toucher au catalogue).
   *  Déclenche un avertissement si un câble est déjà branché sur ce port. */
  portSignalOverrides?: Record<string, SignalType>;
  /** IDs des ports du catalogue masqués sur cette instance (câbles supprimés auto). */
  hiddenPorts?: string[];
  portOrder?: string[];
  extraPorts?: Port[];
  /** Bloc vierge : textes et ports 100 % par instance, non liés au catalogue. */
  isBlankBlock?: boolean;
  blockManufacturer?: string;
  blockReference?: string;
  blockCategory?: string;
}

export interface Zone {
  id: string;
  label: string;
  color: string;
}

export type PortSide = "in" | "out" | "midL" | "midR";

export interface Cable {
  id: string;
  number: string;
  fromNodeId: string;
  fromPortId: string;
  fromPortSide?: PortSide;
  toNodeId: string;
  toPortId: string;
  toPortSide?: PortSide;
  signal: SignalType;
  cableType: string;
  /** Longueur en mètres. Vide (undefined) à la création, à renseigner par l'utilisateur. */
  lengthMeters?: number;
  label?: string;
  labelOffset?: { x: number; y: number };
  reversed?: boolean;
  waypoints?: { x: number; y: number }[];
}

export interface ProjectMeta {
  campus: string;
  lieu: string;
  client: string;
  bureauEtude: string;
  trade: string;
  authorName: string;
  version: string;
  date: string;
}

/** Une ligne du Tableau IP. */
export interface IPTableRow {
  /** ID interne stable. */
  id: string
  /** IDs des PlacedProduct liés (dans les onglets synoptiques). Vide pour les
   *  lignes ajoutées manuellement → permet de modifier le LABEL sans perdre
   *  le lien quand le LABEL change. */
  productInstanceIds: string[]
  /** True = ligne ajoutée manuellement (n'écrit pas dans les synoptiques). */
  manual: boolean
  product: string
  label: string
  deviceId: string
  ip: string
  ipDante: string
  ipDanteSec: string
  login: string
  password: string
  serialNumber: string
  mac: string
  macDante: string
  /** Valeurs des colonnes personnalisées (clé = IPTableColumnConfig.id). */
  customFields?: Record<string, string>
}

/** Définition d'une colonne du Tableau IP (colonnes fixes + colonnes custom). */
export interface IPTableColumnConfig {
  /** Identifiant stable : clé de IPTableRow pour les colonnes fixes,
   *  ou 'custom_xxxx' pour les colonnes ajoutées par l'utilisateur. */
  id: string
  /** Intitulé affiché dans l'en-tête. */
  label: string
  /** Largeur CSS (ex. "130px"). */
  width?: string
  /** True = colonne affichée dans le tableau. */
  visible: boolean
  /** True = colonne ajoutée manuellement par l'utilisateur (texte libre). */
  custom?: boolean
}

/** Structure par défaut des colonnes du Tableau IP pour un nouveau projet. */
export const DEFAULT_IP_TABLE_COLUMNS: IPTableColumnConfig[] = [
  { id: "product",      label: "PRODUIT",       width: "180px", visible: true },
  { id: "label",        label: "LABEL",         width: "120px", visible: true },
  { id: "deviceId",     label: "ID",            width: "80px",  visible: true },
  { id: "ip",           label: "IP",            width: "130px", visible: true },
  { id: "ipDante",      label: "IP DANTE",      width: "130px", visible: true },
  { id: "ipDanteSec",   label: "IP DANTE SEC",  width: "130px", visible: true },
  { id: "login",        label: "LOGIN",         width: "100px", visible: true },
  { id: "password",     label: "MOT DE PASSE",  width: "120px", visible: true },
  { id: "serialNumber", label: "N° SERIE",      width: "120px", visible: true },
  { id: "mac",          label: "MAC",           width: "140px", visible: true },
  { id: "macDante",     label: "MAC DANTE",     width: "140px", visible: true },
]

/** Cartouche réseau du Tableau IP. */
export interface IPNetworkInfo {
  plageIp: string
  dhcp: string
  dns: string
  passerelle: string
  ntp: string
}

// ── Baie (rack planner) ──────────────────────────────────────────────────────

/** Une baie physique au sein d'un onglet baie (supporte plusieurs baies côte à côte). */
export interface Rack {
  id: string
  name: string
  widthInch: 10 | 19
  heightU: number
  numberingFromBottom: boolean
  items: RackItem[]
}

export interface RackAnnotations {
  comment?: string
  ip?: string
  switchPort?: string
  vlan?: string
  serial?: string
}

export interface RackItem {
  id: string
  /** Provenance : produit d'un synoptique, produit du catalogue, ou accessoire intégré. */
  sourceType: 'synoptic' | 'catalog' | 'accessory'
  /** ID du produit dans le catalogue (si sourceType !== 'accessory'). */
  productId?: string
  /** ID du PlacedProduct dans un synoptique (si sourceType === 'synoptic'). */
  nodeId?: string
  label?: string
  manufacturer?: string
  reference?: string
  category?: string
  /** Position en U depuis le bas (1-indexé). */
  uStart: number
  /** Hauteur en U. */
  heightU: number
  /** Largeur en colonnes : 1=quarter, 2=half, 4=full. */
  widthCols: 1 | 2 | 4
  /** Colonne de départ (0–3). */
  colStart: 0 | 1 | 2 | 3
  color?: string
  locked?: boolean
  annotations?: RackAnnotations
  /** Logo affiché en haut à droite dans le visuel rack (data URL base64 ou URL). */
  logoUrl?: string
}

/** Groupe de nœuds (produits, textes, formes, images) liés pour déplacement/copie simultanés. */
export interface NodeGroup {
  id: string;
  nodeIds: string[];
}

/** Un onglet au sein d'un projet. Type discriminé par `kind`.
 *  - `kind` absent ou 'synoptic' → onglet synoptique graphique (rétrocompat).
 *  - `kind === 'iptable'` → onglet Tableau IP.
 *  - `kind === 'bay'` → onglet Baie (rack planner). */
export interface Tab {
  id: string
  name: string
  kind?: 'synoptic' | 'iptable' | 'bay'
  // ── Champs synoptique (toujours présents, vides pour onglets IP/Baie) ─
  trade?: string
  nodes: PlacedProduct[]
  cables: Cable[]
  zones: Zone[]
  textNodes?: TextNodeData[]
  shapeNodes?: ShapeNodeData[]
  imageNodes?: ImageNodeData[]
  groups?: NodeGroup[]
  // ── Champs Tableau IP (présents pour onglets IP uniquement) ──────────
  rows?: IPTableRow[]
  network?: IPNetworkInfo
  documentTitle?: string
  // ── Champs Baie (présents pour onglets Baie uniquement) ──────────────
  bayWidthInch?: 10 | 19
  bayHeightU?: number
  bayNumberingFromBottom?: boolean
  bayItems?: RackItem[]
  /** Baies physiques (v2 multi-rack). Remplace bayItems/bayWidthInch/etc. si présent. */
  racks?: Rack[]
}

/** Helper : true si l'onglet est un Tableau IP. */
export const isIPTableTab = (t: Tab): boolean => t.kind === 'iptable'

/**
 * Retourne les racks d'un onglet baie.
 * Si l'onglet est au format legacy (pas de `racks`), retourne un rack virtuel
 * construit depuis bayItems/bayWidthInch/bayHeightU pour compatibilité ascendante.
 */
export function ensureRacks(tab: Tab): Rack[] {
  if (tab.racks && tab.racks.length > 0) return tab.racks;
  return [{
    id: `${tab.id}-r0`,
    name: tab.name,
    widthInch: tab.bayWidthInch ?? 19,
    heightU: tab.bayHeightU ?? 42,
    numberingFromBottom: tab.bayNumberingFromBottom !== false,
    items: tab.bayItems ?? [],
  }];
}
/** Helper : true si l'onglet est une Baie. */
export const isBayTab = (t: Tab): boolean => t.kind === 'bay'
/** Helper : true si l'onglet est un synoptique (compat ascendant si kind absent). */
export const isSynopticTab = (t: Tab): boolean => t.kind !== 'iptable' && t.kind !== 'bay'

/** Cartouche réseau par défaut à la création d'un Tableau IP. */
export const DEFAULT_IP_NETWORK: IPNetworkInfo = {
  plageIp: '',
  dhcp: '',
  dns: '',
  passerelle: '',
  ntp: '',
}

/** Bloc image importable (SVG, PNG, JPEG, GIF, WebP) positionnable sur le canvas. */
export interface ImageNodeData {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  /** Source encodée : 'base64' (data URL) ou 'url' (lien externe). */
  srcType: 'base64' | 'url';
  src: string;
  /** Calque : 'background' (derrière les produits) ou 'foreground' (devant). */
  layer: 'background' | 'foreground';
  /** Ordre d'empilement entre images du même calque. */
  zOrder: number;
  borderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  /** Opacité de 0 à 1. */
  opacity: number;
}

/** Bloc forme (rectangle ou ellipse) positionnable sur le canvas.
 *  Toujours rendu en arrière-plan de tous les autres objets. */
export interface ShapeNodeData {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  shape: 'rectangle' | 'ellipse' | 'cloud';
  background: string;
  borderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  borderColor: string;
  borderWidth: number;
  /** Rayon des coins arrondis en px (ignoré si shape === 'ellipse' | 'cloud'). */
  borderRadius: number;
  /** Ordre d'empilement entre formes : plus la valeur est haute, plus la forme est au premier plan. */
  zOrder: number;
}

/** Bloc texte libre positionnable sur le canvas. */
export interface TextNodeData {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  content: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textAlign: 'left' | 'center' | 'right';
  color: string;
  background: string;
  borderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  borderColor: string;
  /** Épaisseur de bordure en px. Optionnel pour compatibilité ascendante (fallback : 1). */
  borderWidth?: number;
  /** Rayon des coins arrondis en px (0 = carré). Optionnel pour compatibilité ascendante. */
  borderRadius?: number;
}

export interface SignalDef {
  id: string;
  label: string;
  color: string;
  defaultCable: string;
  numberPrefix: string;
}

/**
 * Légende des types de câbles utilisée par défaut pour un nouveau projet.
 *
 * L'ORDRE des entrées est significatif : il détermine l'ordre d'affichage
 * dans le panneau Légende. ES2015+ préserve l'ordre d'insertion des clés
 * string dans un objet.
 *
 * Modifier cette liste impacte uniquement les NOUVEAUX projets (et les
 * utilisateurs sans signal personnalisé). Pour qu'un utilisateur existant
 * retrouve cette liste, il doit utiliser le bouton « Réinitialiser la
 * légende » dans le panneau Légende.
 */
export const DEFAULT_SIGNAL_DEFS: Record<string, SignalDef> = {
  HDMI:  { id: "HDMI",  label: "HDMI",                color: "#8B4FBA", defaultCable: "HDMI",           numberPrefix: "HDMI" },
  RJ45:  { id: "RJ45",  label: "RJ45 / IP",           color: "#934d2f", defaultCable: "RJ45",           numberPrefix: "IP" },
  USB:   { id: "USB",   label: "USB",                 color: "#66d95e", defaultCable: "USB",            numberPrefix: "USB" },
  RS232: { id: "RS232", label: "RS232",               color: "#00BFD8", defaultCable: "RS232 DB9",      numberPrefix: "COM" },
  DTP:   { id: "DTP",   label: "DTP/XTP/HDBaseT",     color: "#000000", defaultCable: "DTP",            numberPrefix: "DTP" },
  EBUS:  { id: "EBUS",  label: "eBUS/Cresnet",        color: "#1F4E96", defaultCable: "STP22-2",        numberPrefix: "EB" },
  AUDIO: { id: "AUDIO", label: "Audio",               color: "#F5C432", defaultCable: "Audio",          numberPrefix: "AU" },
  HP:    { id: "HP",    label: "HP",                  color: "#E63946", defaultCable: "HP",             numberPrefix: "HP" },
  POWER: { id: "POWER", label: "Secteur",             color: "#6B7280", defaultCable: "Cordon secteur", numberPrefix: "P" },
  FIBER: { id: "FIBER", label: "SFP/Fibre",           color: "#FF6F00", defaultCable: "Fibre",          numberPrefix: "FB" },
};
