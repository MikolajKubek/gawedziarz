import {
  BookOpen, Castle, Crown, Flag, Gem, Milestone, PawPrint, Play, Sparkles, Swords, Users, Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { EntityType } from './schema';

export const TYPE_ICONS: Record<EntityType, LucideIcon> = {
  story: Workflow,
  character: Users,
  creature: PawPrint,
  location: Castle,
  item: Gem,
  glossary: BookOpen,
};

export const KIND_ICONS: Record<string, LucideIcon> = {
  start: Play,
  event: Sparkles,
  quest: Swords,
  checkpoint: Milestone,
  ending: Crown,
};
export const DEFAULT_KIND_ICON = Flag;

export function TypeIcon({ type, size = 16, className }: { type: EntityType; size?: number; className?: string }) {
  const I = TYPE_ICONS[type];
  return <I size={size} strokeWidth={1.75} className={className} />;
}
