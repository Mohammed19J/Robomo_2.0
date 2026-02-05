export function isInt(value) {
  return !isNaN(value) && parseInt(Number(value)) == value && !isNaN(parseInt(value, 10));
}

export function isFloat(value) {
  return !isNaN(value) && value.toString().indexOf(".") != -1;
}