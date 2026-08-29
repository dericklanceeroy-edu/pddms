export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'
export type CustomerDiscount = 'none' | 'senior' | 'pwd'

export interface ItemBatch {
  id: number
  batchNumber: string
  supplier: string
  stock: number
  sellPrice: number
  expiresAt: string
}

export interface ItemProfile {
  id: number
  genericName: string
  brandName: string
  category: string
  formulation: string
  prescriptionRequired: boolean
  controlled: boolean
  reorderLevel: number
  genericEquivalentIds: number[]
  batches: ItemBatch[]
}

export interface CustomerTransaction {
  id: string
  purchasedAt: string
  itemCount: number
  total: number
}

export interface CustomerProfile {
  id: number
  fullName: string
  phone: string
  email: string
  address: string
  discountType: CustomerDiscount
  discountId: string
  discountExpiresAt: string | null
  transactions: CustomerTransaction[]
  createdAt: string
}

export const initialItems: ItemProfile[] = [
  {
    id: 1,
    genericName: 'Paracetamol',
    brandName: 'Biogesic',
    category: 'Analgesic',
    formulation: '500 mg tablet',
    prescriptionRequired: false,
    controlled: false,
    reorderLevel: 40,
    genericEquivalentIds: [2],
    batches: [
      {
        id: 11,
        batchNumber: 'BIO-26018',
        supplier: 'Unilab',
        stock: 84,
        sellPrice: 6.5,
        expiresAt: '2027-05-31'
      },
      {
        id: 12,
        batchNumber: 'BIO-26009',
        supplier: 'Unilab',
        stock: 24,
        sellPrice: 6.25,
        expiresAt: '2026-11-30'
      }
    ]
  },
  {
    id: 2,
    genericName: 'Paracetamol',
    brandName: 'RiteMed',
    category: 'Analgesic',
    formulation: '500 mg tablet',
    prescriptionRequired: false,
    controlled: false,
    reorderLevel: 50,
    genericEquivalentIds: [1],
    batches: [
      {
        id: 21,
        batchNumber: 'RIT-26112',
        supplier: 'RiteMed',
        stock: 36,
        sellPrice: 4.25,
        expiresAt: '2027-02-28'
      }
    ]
  },
  {
    id: 3,
    genericName: 'Amoxicillin',
    brandName: 'Amoxil',
    category: 'Antibiotic',
    formulation: '500 mg capsule',
    prescriptionRequired: true,
    controlled: false,
    reorderLevel: 30,
    genericEquivalentIds: [],
    batches: [
      {
        id: 31,
        batchNumber: 'AMX-26044',
        supplier: 'GSK',
        stock: 18,
        sellPrice: 18.75,
        expiresAt: '2026-10-31'
      }
    ]
  },
  {
    id: 4,
    genericName: 'Salbutamol',
    brandName: 'Ventolin',
    category: 'Respiratory',
    formulation: '2 mg/5 mL syrup',
    prescriptionRequired: true,
    controlled: false,
    reorderLevel: 12,
    genericEquivalentIds: [],
    batches: []
  }
]

export const initialCustomers: CustomerProfile[] = [
  {
    id: 1,
    fullName: 'Rosa Dela Cruz',
    phone: '0917 555 0124',
    email: 'rosa@example.com',
    address: 'General Santos City',
    discountType: 'senior',
    discountId: 'SC-1234-5678',
    discountExpiresAt: null,
    createdAt: '2026-07-14',
    transactions: [
      {
        id: 'MP-2026-0829-014',
        purchasedAt: '2026-08-29T08:21:00+08:00',
        itemCount: 3,
        total: 184.5
      },
      { id: 'MP-2026-0818-092', purchasedAt: '2026-08-18T14:03:00+08:00', itemCount: 2, total: 96 }
    ]
  },
  {
    id: 2,
    fullName: 'Carlo Mendoza',
    phone: '0920 441 7732',
    email: 'carlo@example.com',
    address: 'Polomolok, South Cotabato',
    discountType: 'pwd',
    discountId: 'PWD-9501-2487',
    discountExpiresAt: '2028-03-31',
    createdAt: '2026-07-20',
    transactions: [
      {
        id: 'MP-2026-0827-061',
        purchasedAt: '2026-08-27T11:32:00+08:00',
        itemCount: 4,
        total: 312.8
      }
    ]
  },
  {
    id: 3,
    fullName: 'Lea Ramos',
    phone: '0918 300 8127',
    email: '',
    address: 'General Santos City',
    discountType: 'none',
    discountId: '',
    discountExpiresAt: null,
    createdAt: '2026-08-02',
    transactions: []
  }
]

export const getItemStock = (item: ItemProfile): number =>
  item.batches.reduce((total, batch) => total + batch.stock, 0)

export const getStockStatus = (item: ItemProfile): StockStatus => {
  const stock = getItemStock(item)
  if (stock === 0) return 'out-of-stock'
  return stock <= item.reorderLevel ? 'low-stock' : 'in-stock'
}
