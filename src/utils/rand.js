export const rand = (min, max) => {
  
    if (min === undefined) {
    min = 0;
    max = 1;

  } else if (max === undefined) {
    max = min;
    min = 0;
  }

  return min + Math.random() * (max - min);
};