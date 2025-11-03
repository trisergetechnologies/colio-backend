/**
 * Mask email address for privacy
 * @param {string} email - Email address to mask
 * @returns {string} - Masked email (e.g., a****z@gmail.com)
 */
export const maskEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return '';
  }

  try {
    const [localPart, domain] = email.split('@');
    
    if (!localPart || !domain) {
      return email; // Return as-is if not a valid email format
    }

    // If local part is too short, show first char + asterisks
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }

    // Show first and last character of local part
    const firstChar = localPart[0];
    const lastChar = localPart[localPart.length - 1];
    const middleLength = Math.max(3, localPart.length - 2);
    const asterisks = '*'.repeat(middleLength);

    return `${firstChar}${asterisks}${lastChar}@${domain}`;
  } catch (error) {
    console.error('Email masking error:', error);
    return email; // Return original if masking fails
  }
};

/**
 * Mask phone number for privacy
 * @param {string} phone - Phone number to mask
 * @returns {string} - Masked phone (e.g., +91*****1234)
 */
export const maskPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return '';
  }

  try {
    // Remove all non-digit characters except + at the beginning
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    if (cleanPhone.length < 4) {
      return phone; // Return as-is if too short
    }

    // Check if it has country code (starts with +)
    const hasCountryCode = cleanPhone.startsWith('+');
    const digits = hasCountryCode ? cleanPhone.slice(1) : cleanPhone;

    if (digits.length <= 6) {
      // For short numbers, show first 2 and last 2 digits
      const firstTwo = digits.slice(0, 2);
      const lastTwo = digits.slice(-2);
      const middleAsterisks = '*'.repeat(Math.max(2, digits.length - 4));
      return hasCountryCode ? `+${firstTwo}${middleAsterisks}${lastTwo}` : `${firstTwo}${middleAsterisks}${lastTwo}`;
    }

    // For longer numbers (typical mobile numbers)
    // Show country code + first 2 digits + asterisks + last 4 digits
    let result = '';
    
    if (hasCountryCode) {
      // Extract country code (assume 1-3 digits)
      const countryCodeLength = digits.length >= 10 ? 2 : 1; // Simple heuristic
      const countryCode = digits.slice(0, countryCodeLength);
      const restDigits = digits.slice(countryCodeLength);
      
      if (restDigits.length >= 6) {
        const firstTwo = restDigits.slice(0, 2);
        const lastFour = restDigits.slice(-4);
        const middleLength = Math.max(3, restDigits.length - 6);
        const asterisks = '*'.repeat(middleLength);
        result = `+${countryCode}${firstTwo}${asterisks}${lastFour}`;
      } else {
        result = `+${countryCode}${'*'.repeat(restDigits.length)}`;
      }
    } else {
      // No country code
      const firstTwo = digits.slice(0, 2);
      const lastFour = digits.slice(-4);
      const middleLength = Math.max(3, digits.length - 6);
      const asterisks = '*'.repeat(middleLength);
      result = `${firstTwo}${asterisks}${lastFour}`;
    }

    return result;
  } catch (error) {
    console.error('Phone masking error:', error);
    return phone; // Return original if masking fails
  }
};

/**
 * Mask name for privacy (show first name only)
 * @param {string} name - Full name to mask
 * @returns {string} - Masked name (e.g., "John D.")
 */
export const maskName = (name) => {
  if (!name || typeof name !== 'string') {
    return '';
  }

  try {
    const nameParts = name.trim().split(' ');
    
    if (nameParts.length === 1) {
      // Only first name provided
      return nameParts[0];
    }

    // Show first name + first letter of last name
    const firstName = nameParts[0];
    const lastNameInitial = nameParts[nameParts.length - 1][0];
    
    return `${firstName} ${lastNameInitial}.`;
  } catch (error) {
    console.error('Name masking error:', error);
    return name;
  }
};

/**
 * Mask credit card number
 * @param {string} cardNumber - Credit card number to mask
 * @returns {string} - Masked card number (e.g., "**** **** **** 1234")
 */
export const maskCardNumber = (cardNumber) => {
  if (!cardNumber || typeof cardNumber !== 'string') {
    return '';
  }

  try {
    // Remove all non-digit characters
    const digits = cardNumber.replace(/\D/g, '');
    
    if (digits.length < 4) {
      return '*'.repeat(digits.length);
    }

    // Show last 4 digits only
    const lastFour = digits.slice(-4);
    const maskedLength = digits.length - 4;
    
    // Format as groups of 4
    let masked = '*'.repeat(maskedLength);
    let formatted = '';
    
    // Add asterisks in groups of 4
    for (let i = 0; i < maskedLength; i += 4) {
      if (i > 0) formatted += ' ';
      formatted += '*'.repeat(Math.min(4, maskedLength - i));
    }
    
    formatted += ` ${lastFour}`;
    return formatted;
  } catch (error) {
    console.error('Card masking error:', error);
    return cardNumber;
  }
};

/**
 * Mask any generic string (show first and last characters)
 * @param {string} str - String to mask
 * @param {number} visibleChars - Number of visible characters at start and end
 * @returns {string} - Masked string
 */
export const maskString = (str, visibleChars = 1) => {
  if (!str || typeof str !== 'string') {
    return '';
  }

  if (str.length <= visibleChars * 2) {
    return '*'.repeat(str.length);
  }

  try {
    const start = str.slice(0, visibleChars);
    const end = str.slice(-visibleChars);
    const middleLength = str.length - (visibleChars * 2);
    const middle = '*'.repeat(middleLength);
    
    return `${start}${middle}${end}`;
  } catch (error) {
    console.error('String masking error:', error);
    return str;
  }
};