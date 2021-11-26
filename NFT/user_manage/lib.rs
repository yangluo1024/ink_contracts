#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod user_manage {
    use ink_storage::collections::HashMap as StorageHashMap;
    use ink_storage::traits::{SpreadLayout, PackedLayout};
    use scale::{Encode, Decode};

    use ink_prelude::string::String;

    #[derive(Debug, PartialEq, Eq, Encode, Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct User {
        name: String,
        desc: String,  // description of user
        avatar_nft_id: u128,
        status: u8,  // 0:non, 1:upload works, 2:sponsor proposal, 3:create NFT, 4:been complained
        is_registered: bool, 
    }

    #[ink(storage)]
    pub struct UserManage {
        /// total users.
        total_users: u128,
        /// Mapping from `AccountId` to User Info.
        users: StorageHashMap<AccountId, User>,
        /// Mapping from `AccountId` to a bool value.
        is_manager: StorageHashMap<AccountId, bool>,
    }

    impl UserManage {
        /// Constructor that initializes the `bool` value to the given `init_value`.
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {
                total_users: 0,
                users: StorageHashMap::new(),
                is_manager: StorageHashMap::new(),
            }
        }

        #[ink(message)]
        pub fn update_user_info(
            &mut self, 
            _name: String, 
            _desc: String, 
            _avatar_nft_id: u128,
        ) -> bool {
            true
        }

        #[ink(message)]
        pub fn modify_user_info(&mut self, _addr: AccountId, _status: u8) -> bool {
            true
        }

        #[ink(message)]
        pub fn set_manager(&mut self, _user: AccountId, _is_manager: bool) {

        }
    }
}
