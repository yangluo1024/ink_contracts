#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod collection_manage {
    use ink_prelude::string::String;
    use ink_prelude::vec::Vec;
    use ink_storage::traits::{SpreadLayout, PackedLayout};
    use ink_storage::collections::HashMap as StorageHashMap;
    use scale::{Encode, Decode};

    #[derive(Debug, PartialEq, Eq, Encode, Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct Work {
        name: String,
        url: String,  // work cid + store the method of split and whole fragment data.
        uploader: AccountId, 
        complete_nft_id: u128,  // token id of complete NFT
        complete_nft_num: u64,  // balance of complete NFT
        comp_to_frag_nft_num: u64,  // balance of fragment NFT
        frag_num_per_comp_nft: u64,  // how many fragments one complete NFT correspond
        status: u8,  // 0:not create mystery package, >0:present how many nftid there in the mystery package.
    }

    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct Collection {
        name: String,
        desc: String,
        url: String,
        work_ids: Vec<u128>,  // the ids of owned works
    }

    #[ink(storage)]
    pub struct CollectionManage {
        /// Minimum fragments requirement.
        min_frag_num: u64,
        /// Id of the work.
        work_id: u128,
        /// Mapping from `work_id` to `Work`.
        works: StorageHashMap<u128, Work>,
        /// Id of collection.
        collection_id: u128,
        /// Mapping from `collection_id` to `Collection`.
        collections: StorageHashMap<u128, Collection>,
        /// Mapping from `AccountId` to owned collections.
        user_collections: StorageHashMap<AccountId, Vec<Collection>>,
        /// Mapping from `AccountId` to a bool value.
        is_manager: StorageHashMap<AccountId, bool>,
    }

    impl CollectionManage {
        #[ink(constructor)]
        pub fn new() -> Self {
            // TODO: need to add three contracts address: `mysteryBox`, `democracy` and `crowdfund`.
            Self {
                min_frag_num: 10,
                work_id: 0,
                works: StorageHashMap::new(),
                collection_id: 0,
                collections: StorageHashMap::new(),
                user_collections: StorageHashMap::new(),
                is_manager: StorageHashMap::new(),
            }
        }

        #[ink(message)]
        pub fn set_crowdfund(&mut self, _crowd_addr: AccountId) {
            // only owner
        }

        #[ink(message)]
        pub fn add_works(
            &mut self,
            _collection_name: String,
            _collection_desc: String,
            _collection_url: String,
            _work_names: Vec<String>,
            _urls: Vec<String>,
            _complete_nft_num: Vec<u64>,
            _comp_to_frag_nft_num: Vec<u64>,
            _frag_num_per_comp_nft: Vec<u64>,
        ) -> u128 {
            self.collection_id
        }

        #[ink(message)]
        pub fn create_proposal(
            &mut self,
            _collection_name: String,
            _collection_desc: String,
            _collection_url: String,
            _work_names: Vec<String>,
            _urls: Vec<String>,
            _complete_nft_num: Vec<u64>,
            _comp_to_frag_nft_num: Vec<u64>,
            _frag_num_per_comp_nft: Vec<u64>,
        ) -> bool {
            true
        }

        #[ink(message)]
        pub fn add_works_into_collection(
            &mut self,
            _collection_id: u128,
            _work_names: Vec<String>,
            _urls: Vec<String>,
            _complete_nft_num: Vec<u64>,
            _comp_to_frag_nft_num: Vec<u64>,
            _frag_num_per_comp_nft: Vec<u64>,
        ) -> bool {
            true
        }

        #[ink(message)]
        pub fn delete_work_of_collection(
            &mut self, 
            _work_id: u128,
            _collection_id: u128,
        ) -> bool {
            true
        }

        #[ink(message)]
        pub fn update_works(
            &mut self,
            _work_ids: Vec<u128>,
            _work_names: Vec<String>,
            _urls: Vec<String>,
            _complete_nft_num: Vec<u64>,
            _comp_to_frag_nft_num: Vec<u64>,
            _frag_num_per_comp_nft: Vec<u64>,
        ) -> bool {
            true
        }

        #[ink(message)]
        pub fn fulfill_work_nft_info(
            &mut self,
            _work_id: u128,
            _complete_nft_id: u128,
        ) -> bool {
            true
        }

        #[ink(message)]
        pub fn prepare_mb_package(
            &mut self,
            _work_id: u128,
            _start_index: u64,
            _end_index: u64,
        ) {}

        #[ink(message)]
        pub fn create_mb_package(
            &mut self,
            _work_id: u128,
            _start_index: u64,
            _end_index: u64,
        ) {}

        #[ink(message)]
        pub fn set_min_frag_num(&mut self, new_num: u64) {
            self.min_frag_num = new_num;
        }

        #[ink(message)]
        pub fn get_collection_len(&self, _collection_id: u128) -> u64 {
            let coll = self.collections.get(&_collection_id).cloned().unwrap();
            coll.work_ids.len() as u64
        }

        #[ink(message)]
        pub fn get_work_ids_of_collection(
            &self,
            _collection_id: u128,
            _start_index: u64,
            _end_index: u64,
        ) -> Vec<u128> {
            let coll = self.collections.get(&_collection_id).cloned().unwrap();
            coll.work_ids
        }

        #[ink(message)]
        pub fn get_all_work_ids_of_collection(&self, _collection_id: u128) -> Vec<u128> {
            let coll = self.collections.get(&_collection_id).cloned().unwrap();
            coll.work_ids
        }

        #[ink(message)]
        pub fn get_works_info(&self, _work_ids: Vec<u128>) {}

        #[ink(message)]
        pub fn get_frag_nft_infos_of_work(
            &self,
            _work_id: u128,
            _start_index: u64,
            _end_index: u64,
        ) {}

        #[ink(message)]
        pub fn is_work_of_collection(&self, _work_id: u128, _collection_id: u128) {}

        #[ink(message)]
        pub fn get_user_collections_len(&self, user: AccountId) -> u64 {
            let colls = self.user_collections.get(&user).cloned().unwrap();
            colls.len() as u64
        }

        #[ink(message)]
        pub fn get_works_of_collection(&self, _collection_id: u128) {}  // get work ids' length, then call self.get_works_info()

        #[ink(message)]
        pub fn get_field_array_of_works_of_collection(&self, _collection_id: u128) {}

        #[ink(message)]
        pub fn get_uploader_of_collection(&self, _collection_id: u128) {}
    }
}
