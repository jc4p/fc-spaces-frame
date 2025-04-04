// Regex patterns for input validation
export const validEthAddressRegex = /^0x[a-fA-F0-9]{40}$/;
export const validFidRegex = /^[1-9]\d*$/;

// Validate Ethereum address
export function isValidEthAddress(address) {
  return typeof address === 'string' && validEthAddressRegex.test(address);
}

// Validate Farcaster ID
export function isValidFid(fid) {
  return typeof fid === 'string' && validFidRegex.test(fid);
}