import { BUILTIN_TEXT_TRANSFORM_SNIPPETS } from '../src/features/snippets/transforms';

describe('transforms.ts tests', () => {
  const inlineDoubleDollarTransform = BUILTIN_TEXT_TRANSFORM_SNIPPETS.find(
    s => s.id === 'clean-inline-double-dollar-symbols'
  )?.transform;

  it('should exist', () => {
    expect(inlineDoubleDollarTransform).toBeDefined();
  });

  if (inlineDoubleDollarTransform) {
    it('should convert inline $$ to $ while keeping block $$', () => {
      const sample = `At low concentrations, however, the expansion,
$$
\\varepsilon_{\\rm reg}(k)=b_0^*+b_2^*k^2+\\cdots
$$
has $$b_0^*$$ dominated by water dipole correlations, so $$E^*(\\kappa)\\approx\\varepsilon_{\\rm dip}(c)$$`;

      const expected = `At low concentrations, however, the expansion,
$$
\\varepsilon_{\\rm reg}(k)=b_0^*+b_2^*k^2+\\cdots
$$
has $b_0^*$ dominated by water dipole correlations, so $E^*(\\kappa)\\approx\\varepsilon_{\\rm dip}(c)$`;

      expect(inlineDoubleDollarTransform(sample)).toBe(expected);
    });

    it('should keep block $$ with leading spaces', () => {
      const sample = `  $$
\\varepsilon = b
  $$`;
      expect(inlineDoubleDollarTransform(sample)).toBe(sample);
    });

    it('should keep single-line block equation', () => {
      expect(inlineDoubleDollarTransform('$$ x = y $$')).toBe('$$ x = y $$');
      expect(inlineDoubleDollarTransform('  $$ x = y $$  ')).toBe('  $$ x = y $$  ');
    });

    it('should handle single-line input for inline $$', () => {
      expect(inlineDoubleDollarTransform('has $$b_0^*$$')).toBe('has $b_0^*$');
    });

    it('should handle inline equation that starts at beginning of line but has text on same line', () => {
      expect(inlineDoubleDollarTransform('$$b_0^*$$ is the value')).toBe('$b_0^*$ is the value');
    });
  }
});
