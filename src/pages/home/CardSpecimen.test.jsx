import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardSpecimen } from './CardSpecimen.jsx';

vi.mock('../../components/shared/cardImage.js', () => ({
  pickCardImage: (card) => card?.image_url || null,
}));

// useTilt touches pointer/DOM refs not relevant to this test — stub it to a
// no-op so the test focuses purely on the image-fail fallback behavior.
vi.mock('../../lib/useTilt.js', () => ({
  useTilt: () => ({ plateRef: { current: null }, onPointerMove: () => {}, onPointerLeave: () => {} }),
}));

describe('CardSpecimen — image fallback', () => {
  it('renders the <img> when a src is present', () => {
    render(<CardSpecimen card={{ name: 'Charizard', image_url: 'https://example.com/charizard.webp' }} />);
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('https://example.com/charizard.webp');
  });

  it('shows the placeholder layer, not a broken <img>, once the image fails to load', () => {
    const { container } = render(
      <CardSpecimen card={{ name: 'Charizard', image_url: 'https://example.com/broken.webp' }} />
    );
    const img = screen.getByRole('img', { hidden: true });
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.specimen-ph')).not.toBeNull();
  });

  it('has no fallback needed when there is no card at all', () => {
    const { container } = render(<CardSpecimen card={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.specimen-ph')).not.toBeNull();
  });
});
