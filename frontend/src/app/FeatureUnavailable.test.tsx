import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FeatureUnavailable } from './FeatureUnavailable';

describe('FeatureUnavailable', () => {
  it('renders unavailable and externally supplied text as text, not markup', () => {
    render(
      <MemoryRouter>
        <FeatureUnavailable title="Registry result <untrusted>" detail="Office Action summary <untrusted>" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Registry result <untrusted>')).toBeVisible();
    expect(screen.getByText('Office Action summary <untrusted>')).toBeVisible();
    expect(document.querySelector('untrusted')).toBeNull();
  });
});
