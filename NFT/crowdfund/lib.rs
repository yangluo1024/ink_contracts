#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod crowdfund {
    use ink_storage::collections::HashMap as StorageHashMap;
    use ink_storage::traits::{SpreadLayout, PackedLayout};
    use ink_prelude::vec::Vec;
    use scale::{Encode, Decode};

    #[derive(Debug, PartialEq, Eq, Encode, Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct UserInfo {
        amount: u128,  // pledged tokens before crowdfund success
        won_amount: u128, // won tokens in draw lots
        // reward_debts: StorageHashMap<AccountId, u128>, // token addr
        release_amount: u128, // after crowdfund success, 80% each month, 20% after 12 months
        start_index_HNQ: u128,
        end_index_HNQ: u128,
    }

    #[derive(Debug, PartialEq, Eq, Encode, Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct PoolInfo {
        proposal_id: u128,  // equal to collection id
        open_amount: u128,
        
    }

    #[ink(storage)]
    pub struct Crowdfund {
        /// Stores a single `bool` value on the storage.
        value: bool,
    }

    impl Crowdfund {
        /// Constructor that initializes the `bool` value to the given `init_value`.
        #[ink(constructor)]
        pub fn new(init_value: bool) -> Self {
            Self { value: init_value }
        }

        /// Constructor that initializes the `bool` value to `false`.
        ///
        /// Constructors can delegate to other constructors.
        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(Default::default())
        }

        /// A message that can be called on instantiated contracts.
        /// This one flips the value of the stored `bool` from `true`
        /// to `false` and vice versa.
        #[ink(message)]
        pub fn flip(&mut self) {
            self.value = !self.value;
        }
    }
}
