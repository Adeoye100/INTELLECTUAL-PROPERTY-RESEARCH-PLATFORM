import {
  BinocularsIcon,
  ClipboardCheckIcon,
  Globe2Icon,
  HandshakeIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react';

export interface BrandProtectionService {
  id: string;
  title: string;
  summary: string;
  outcomes: readonly string[];
  icon: LucideIcon;
}

export const BRAND_PROTECTION_SERVICES: BrandProtectionService[] = [
  {
    id: 'investigations',
    title: 'Investigations',
    summary: 'Identify counterfeiters, sources, locations, distribution networks, and the people behind them.',
    outcomes: ['Counterfeit and imitation products', 'Illegal manufacturing and warehousing', 'Online, wholesale, and grey-market sellers'],
    icon: BinocularsIcon,
  },
  {
    id: 'field-intelligence',
    title: 'Field Intelligence',
    summary: 'Deploy trained, vetted agents to gather first-hand intelligence lawfully and discreetly.',
    outcomes: ['Observation and test purchases', 'Location and actor verification', 'Documented chain of custody'],
    icon: Globe2Icon,
  },
  {
    id: 'evidence-reporting',
    title: 'Evidence Reports',
    summary: 'Turn verified findings into structured documentation prepared for legal and regulatory review.',
    outcomes: ['Case and target summaries', 'Photographic and documentary evidence', 'Recommended enforcement actions'],
    icon: ClipboardCheckIcon,
  },
  {
    id: 'enforcement-support',
    title: 'Enforcement Liaison',
    summary: 'Submit evidence to the appropriate authorities and support the matter through lawful enforcement.',
    outcomes: ['Agency submission and follow-up', 'Raid and seizure support', 'Witness and technical statements'],
    icon: HandshakeIcon,
  },
  {
    id: 'preventive-technology',
    title: 'Preventive Technology',
    summary: 'Combine authentication, monitoring, portfolio intelligence, and risk signals to detect threats earlier.',
    outcomes: ['Product authentication and serialization', 'Marketplace and brand-abuse monitoring', 'Risk dashboards and investigation triggers'],
    icon: ScanLineIcon,
  },
  {
    id: 'local-representation',
    title: 'Local Representation',
    summary: 'Give international brands an informed local presence for market entry, IP protection, and agency liaison.',
    outcomes: ['Market-entry and regulatory guidance', 'Local monitoring and representation', 'One point of contact on the ground'],
    icon: ShieldCheckIcon,
  },
];

export const WORKFLOW_STEPS = [
  ['Confidential consultation', 'We assess the exposure, rights, products, jurisdictions, and immediate priorities.'],
  ['Investigation plan', 'We agree the objective, lawful scope, timeline, safety controls, and reporting structure.'],
  ['Intelligence gathering', 'Online research and field deployment establish the actors, locations, and operating pattern.'],
  ['Evidence reporting', 'Findings are verified, structured, and documented with their provenance and chain of custody.'],
  ['Enforcement support', 'Evidence is submitted to the competent authorities, whose decisions and powers remain independent.'],
  ['Prevention', 'Monitoring, authentication, and portfolio intelligence help reduce the risk of recurrence.'],
] as const;

export const INDUSTRIES = [
  'Fashion and apparel',
  'Pharmaceuticals and healthcare',
  'Consumer electronics',
  'Food and beverage',
  'Cosmetics and personal care',
  'Industrial and building products',
  'Luxury goods',
] as const;

export const FAQS = [
  ['Is your work legal?', 'Yes. Investigations are scoped to operate within the applicable law, with evidence documented for verification and review.'],
  ['Do you make arrests or conduct raids?', 'No. We gather and submit evidence and may support authorised operations. Arrests, searches, seizures, and prosecutions remain decisions of the competent authorities.'],
  ['Will the target know about the investigation?', 'Discretion is fundamental. Operational details, client identity, strategy, and lawful sources are handled confidentially.'],
  ['Do we need registered intellectual property?', 'Registered rights materially strengthen enforcement. The consultation establishes which rights and supporting records are available before work begins.'],
  ['How long does an investigation take?', 'Timing depends on the scope, locations, actors, and safety considerations. The agreed investigation plan sets the initial timeline and reporting cadence.'],
  ['What does an engagement cost?', 'Every engagement is scoped to the client’s exposure and required work. A confidential consultation comes before a written scope and quotation.'],
  ['Can you help before counterfeiting is discovered?', 'Yes. Preventive monitoring, authentication, portfolio review, and market-entry planning are designed to identify exposure earlier.'],
] as const;
