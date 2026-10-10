export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string
          code: string
          created_at: string
          scheduled_for: string | null
          customer_name: string
          phone: string
          service_type: string
          zone: string
          distance_km: number
          address: string
          subtotal: number
          delivery_fee: number
          service_charge: number
          total: number
          payment_method: string
          proof_status: string
          proof_image: string
          proof_note: string
          status: string
          eta: number
          staff_note: string
        }
        Insert: {
          id?: string
          code: string
          created_at?: string
          scheduled_for?: string | null
          customer_name: string
          phone: string
          service_type: string
          zone?: string
          distance_km?: number
          address?: string
          subtotal: number
          delivery_fee?: number
          service_charge?: number
          total: number
          payment_method: string
          proof_status?: string
          proof_image?: string
          proof_note?: string
          status?: string
          eta?: number
          staff_note?: string
        }
        Update: {
          id?: string
          code?: string
          created_at?: string
          scheduled_for?: string | null
          customer_name?: string
          phone?: string
          service_type?: string
          zone?: string
          distance_km?: number
          address?: string
          subtotal?: number
          delivery_fee?: number
          service_charge?: number
          total?: number
          payment_method?: string
          proof_status?: string
          proof_image?: string
          proof_note?: string
          status?: string
          eta?: number
          staff_note?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          menu_item_id: string
          name: string
          base_price: number
          quantity: number
          base_choice: string
          spice_level: number
          extras: string[]
          extra_price: number
          item_total: number
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          menu_item_id: string
          name: string
          base_price: number
          quantity: number
          base_choice?: string
          spice_level?: number
          extras?: string[]
          extra_price?: number
          item_total: number
          note?: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          menu_item_id?: string
          name?: string
          base_price?: number
          quantity?: number
          base_choice?: string
          spice_level?: number
          extras?: string[]
          extra_price?: number
          item_total?: number
          note?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      customer_sessions: {
        Row: {
          phone: string
          name: string
          otp: string | null
          verified: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          phone: string
          name: string
          otp?: string | null
          verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          phone?: string
          name?: string
          otp?: string | null
          verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
