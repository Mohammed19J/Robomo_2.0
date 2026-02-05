// src/utils/stringParser.js
export function parseAttributeKey(str) {
    // Convert camelCase to space-separated words
    const camelCaseToWords = str.replace(/([A-Z])/g, ' $1');

    // Replace underscores and extra spaces with single space
    const formattedStr = camelCaseToWords.replace(/[_\s]+/g, ' ').trim();

    // Capitalize the first letter of each word
    return formattedStr
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  

export function parseAttributeID(str) {
  return str.split(":").slice(-2).join(":");
}