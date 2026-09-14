/**
 * Banks a staff member in Malaysia can be paid into, grouped the way they
 * appear in the staff form's bank picker. The name is what gets stored, so
 * renaming an entry leaves older staff records pointing at the old name.
 */
export const BANK_GROUPS = [
  {
    label: "Malaysian banks",
    banks: ["Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Alliance Bank", "Affin Bank", "Bank Rakyat", "BSN", "Agrobank", "Co-opbank Pertama"],
  },
  {
    label: "Islamic banks",
    banks: ["Bank Islam", "Bank Muamalat", "MBSB Bank", "Maybank Islamic", "CIMB Islamic Bank", "Public Islamic Bank", "RHB Islamic Bank", "Hong Leong Islamic Bank", "AmBank Islamic", "Alliance Islamic Bank", "Affin Islamic Bank", "HSBC Amanah", "OCBC Al-Amin", "Standard Chartered Saadiq", "Al Rajhi Bank", "Kuwait Finance House"],
  },
  {
    label: "Digital banks",
    banks: ["GXBank", "Boost Bank", "AEON Bank", "KAF Digital Bank", "Ryt Bank"],
  },
  {
    label: "Foreign banks",
    banks: ["UOB Malaysia", "OCBC Bank", "HSBC Bank", "Standard Chartered", "Citibank", "Bank of China", "ICBC", "China Construction Bank", "Bangkok Bank", "MUFG Bank", "Mizuho Bank", "SMBC", "Deutsche Bank", "J.P. Morgan Chase", "BNP Paribas", "Bank of America", "India International Bank"],
  },
] as const;

export const BANK_NAMES = BANK_GROUPS.flatMap(group => group.banks) as [BankName, ...BankName[]];
export type BankName = (typeof BANK_GROUPS)[number]["banks"][number];
