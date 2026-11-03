// Helper function to get a random integer between min and max (inclusive)
export function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const dice = {
  roll(styleInput) {
    if (typeof styleInput === 'number') {
      return styleInput;
    }

    let bonus = 0;
    let total = 0;
    let bonusStr = '';
    let style = '';

    const normalized = String(styleInput || '1d4').toLowerCase().trim();

    if (normalized.indexOf('+') > -1) {
      [style, bonusStr] = normalized.split('+');
      bonus = Number(bonusStr);
    } else if (normalized.indexOf('-') > -1) {
      [style, bonusStr] = normalized.split('-');
      bonus = -Number(bonusStr);
    } else {
      style = normalized;
    }

    if (style.indexOf('d') === -1) {
      return Number(style) + Number(bonus);
    }

    const [rolls, sided] = style.split('d').map(Number);

    for (let i = 0; i < rolls; i++) {
      total += getRandomInt(1, sided);
    }

    total += Number(bonus);
    return total;
  }
};
