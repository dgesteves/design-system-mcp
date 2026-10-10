import type { Rule } from '../context.js';
import {
  iconButtonAccessibleName,
  noUnknownComponent,
  noUnknownProp,
  noUnknownVariant,
  preferDesignSystemComponent,
} from './components.js';
import { noHardcodedColor, noHardcodedRadius, noHardcodedSpacing } from './hardcoded.js';

/** Every rule, in the order they run. */
export const RULES: readonly Rule[] = [
  noHardcodedColor,
  noHardcodedSpacing,
  noHardcodedRadius,
  preferDesignSystemComponent,
  noUnknownComponent,
  noUnknownProp,
  noUnknownVariant,
  iconButtonAccessibleName,
];
