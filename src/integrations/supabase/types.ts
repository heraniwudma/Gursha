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
          user_id: string | null
          guest_lookup_token: string | null
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
          user_id?: string | null
          guest_lookup_token?: string | null
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
          user_id?: string | null
          guest_lookup_token?: string | null
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
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          user_id: string
          email: string
          created_at: string
        }
        Insert: {
          user_id: string
          email: string
          created_at?: string
        }
        Update: {
          user_id?: string
          email?: string
          created_at?: string
        }
        Relationships: []
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
      store_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          id: string
          name: string
          name_am: string | null
          name_sid: string | null
          description: string | null
          desc: string | null
          description_am: string | null
          desc_am: string | null
          description_sid: string | null
          desc_sid: string | null
          price: number
          category: string
          image: string | null
          spice: number
          rating: number
          popular: boolean
          fasting: boolean
          in_stock: boolean
          created_at: string
        }
        Insert: {
          id: string
          name: string
          name_am?: string | null
          name_sid?: string | null
          description?: string | null
          desc?: string | null
          description_am?: string | null
          desc_am?: string | null
          description_sid?: string | null
          desc_sid?: string | null
          price: number
          category: string
          image?: string | null
          spice?: number
          rating?: number
          popular?: boolean
          fasting?: boolean
          in_stock?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          name_am?: string | null
          name_sid?: string | null
          description?: string | null
          desc?: string | null
          description_am?: string | null
          desc_am?: string | null
          description_sid?: string | null
          desc_sid?: string | null
          price?: number
          category?: string
          image?: string | null
          spice?: number
          rating?: number
          popular?: boolean
          fasting?: boolean
          in_stock?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      check_is_admin_email: {
        Args: {
          p_email: string
        }
        Returns: boolean
      }
      get_guest_order: {
        Args: {
          p_code: string
          p_token: string
        }
        Returns: Json
      }
      get_guest_orders: {
        Args: {
          p_orders: Json
        }
        Returns: Json
      }
      submit_guest_payment_proof: {
        Args: {
          p_code: string
          p_token: string
          p_image: string
          p_note: string
        }
        Returns: boolean
      }
      submit_payment_proof: {
        Args: {
          p_code: string
          p_token: string
          p_image: string
          p_note: string
        }
        Returns: boolean
      }
      create_order: {
        Args: {
          p_order: Json
          p_items: Json
        }
        Returns: Json
      }
      get_authorized_order_updates: {
        Args: {
          p_orders: Json
        }
        Returns: Json
      }
      admin_update_order_status: {
        Args: {
          p_code: string
          p_status: string
          p_staff_note?: string
        }
        Returns: boolean
      }
      admin_approve_payment_proof: {
        Args: {
          p_code: string
          p_staff_note?: string
        }
        Returns: boolean
      }
      admin_reject_payment_proof: {
        Args: {
          p_code: string
          p_staff_note?: string
        }
        Returns: boolean
      }
      claim_guest_order: {
        Args: {
          p_code: string
          p_token: string
        }
        Returns: boolean
      }
      claim_verified_phone_orders: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
