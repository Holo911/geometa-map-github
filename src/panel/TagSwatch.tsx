import type { CSSProperties } from 'react';
import type { Tag } from '../lib/types';

/**
 * The one place a tag's colour(s) turn into pixels — rail, chips and the picker
 * all render through here, so a two-colour tag can never look like two
 * different tags depending on where you meet it.
 *
 * A second colour is drawn as a hard diagonal split rather than a blend: these
 * stand for real clue pairs (yellow ON black, blue ON white), and a gradient
 * would invent a colour that isn't on the plate.
 */
export function tagSwatchStyle(tag: Pick<Tag, 'color' | 'color2'>): CSSProperties {
  return {
    background: tag.color2
      ? `linear-gradient(135deg, ${tag.color} 0 50%, ${tag.color2} 50% 100%)`
      : tag.color,
  };
}

interface TagSwatchProps {
  tag: Pick<Tag, 'color' | 'color2'>;
  /** `dot` for inline chips, `square` for the category rail. */
  shape?: 'dot' | 'square';
}

export default function TagSwatch({ tag, shape = 'dot' }: TagSwatchProps) {
  return (
    <span
      className={shape === 'square' ? 'rail-swatch tag-swatch' : 'tag-dot tag-swatch'}
      style={tagSwatchStyle(tag)}
    />
  );
}
