// Facilitator settings. Every value can also be overridden from the URL, e.g.
//   ?unit=SU12&strictpin=1&hints=0&facilitator=1&results=1
export const CONFIG = {
  // PIN handling. With strictPin=false any 4 digits are accepted.
  pin: '1234',
  strictPin: false,
  pinLength: 4,

  // Which cooling unit is installed. The PDF says reversible adapters only
  // need cleaning on the SU12, so this changes what the correct answer is.
  coolingUnit: 'SU05', // 'SU05' | 'SU12'

  // Show the "Hint" button (reveals the current step's title, counted in results).
  allowHints: true,
};
