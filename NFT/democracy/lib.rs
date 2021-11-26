#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod democracy {
    use ink_storage::collections::HashMap as StorageHashMap;
    use ink_storage::traits::{SpreadLayout, PackedLayout};
    use scale::{Encode, Decode};
    use ink_prelude::vec::Vec;

    #[derive(Debug, PartialEq, Eq, Encode, Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct ProposalInfo {
        proposer: AccountId,
        start_time: u128,
        end_time: u128,  // start_time + vote_duration
        last_crowdfund_id: u128,  // last crowdfund id launched by this proposal
        status: u8,  // 1:Proposal, 2:Voting, 3:Passed, 4:Failed, 5:Votes Counted
        fail_num: u8,  // fail_times += 1 when proposal failed, and fail_times <= 3
    }

    #[derive(Debug, PartialEq, Eq, Encode, Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct VoteInfo {
        total_lock_amount: Balance,  // total amount of locked token.
        approve: u128,  // number of approve votes
        against: u128,  // number of against votes
        voters: u128,  // number of voters joined
    }

    #[ink(storage)]
    pub struct Democracy {
        /// Maximun proposal id allowed.
        max_proposal_id: u128,
        /// Total quantity of proposals.
        total_proposal_num: u128,
        /// Pledge amount for issuing complete NFT.
        pw: u128,
        /// Pledge amount for issuing fragment NFT.
        pf: u128,
        /// Minimun pledge amount for all NFT in collection.
        min_total_amount: u128,
        /// An array of proposal ids.
        proposal_ids: Vec<u128>,
        /// Mapping from proposal id to index of `proposal_ids`
        proposal_id_to_index: StorageHashMap<u128, u128>,
        /// Mapping from id to proposal info
        proposal_info: StorageHashMap<u128, ProposalInfo>,
        /// Mapping from `AccountId` to array of ProposalInfo
        user_proposals: StorageHashMap<AccountId, Vec<ProposalInfo>>,
        /// Mapping from (proposal_id, failed_num) to VoteInfo
        votes: StorageHashMap<(u128, u8), VoteInfo>,
        /// Mapping from (AccountId, id, failed_num) to amount of votes.
        user_vote: StorageHashMap<(AccountId, u128, u8), u128>,
        /// Mapping from `AccountId` to array of voted proposal ids
        user_voted_list: StorageHashMap<AccountId, Vec<u128>>,
        /// Mapping from (AccountId, proposal_id) to a bool value
        is_user_voted_prop_id: StorageHashMap<(AccountId, u128), bool>,
        min_voters_need: u128,  // minimum number of vote account need
        vote_duration: u128,  // vote duration
        upload_fee_per_work: u128,  // fee of uploading one work
        /// Mapping from `AccountId` to a bool value
        is_manager: StorageHashMap<AccountId, bool>,
    }

    impl Democracy {
        /// Constructor that initializes the `bool` value to the given `init_value`.
        #[ink(constructor)]
        pub fn new(fee_per_work: u128) -> Self {
            // TODO: need to add contracts' address.
            Self {
                max_proposal_id: 0,
                total_proposal_num: 0,
                pw: 10000 * 1e12 as u128,
                pf: 10000 * 1e12 as u128,
                min_total_amount: 1000000 * 1e12 as u128,
                proposal_ids: Vec::new(),
                proposal_id_to_index: StorageHashMap::new(),
                proposal_info: StorageHashMap::new(),
                user_proposals: StorageHashMap::new(),
                votes: StorageHashMap::new(),
                user_vote: StorageHashMap::new(),
                user_voted_list: StorageHashMap::new(),
                is_user_voted_prop_id: StorageHashMap::new(),
                min_voters_need: 100,
                vote_duration: 20 * 60 * 1000,  // ms
                upload_fee_per_work: fee_per_work,
                is_manager: StorageHashMap::new(),
            }
        }

        #[ink(message)]
        pub fn set_manager(&mut self, _user: AccountId, _is_manager: bool) {}

        #[ink(message)]
        pub fn set_crowdfund(&mut self, _addr: AccountId) {}

        #[ink(message)]
        pub fn init_proposal(&mut self, _collection_id: u128) -> bool { true }

        #[ink(message)]
        pub fn init_proposal_from(
            &mut self,
            _collection_id: u128,
            _uploader: AccountId,
            _len: u64,
        ) -> bool { true }

        #[ink(message)]
        pub fn modify_proposal(&mut self, _proposal_id: u128) {}

        #[ink(message)]
        pub fn get_proposal_statu(&self, _proposal_id: u128) {}

        #[ink(message)]
        pub fn update_proposal_status(&mut self, _proposal_id: u128) {}

        #[ink(message)]
        pub fn vote(&mut self, _proposal_id: u128, _amount: u128) {}

        #[ink(message)]
        pub fn refund(&mut self, _proposal_id: u128, _fail_num: u8) {}

        #[ink(message)]
        pub fn to_crowdfund(
            &mut self,
            _proposal_id: u128,
            _open_amount: u128,
            _divided_ratio: u128,
            _duration: u128,
            _min_join_amount: u128,
            _max_join_amount: u128,
        ) {}

        #[ink(message)]
        pub fn get_target_amount(&self, _proposal_id: u128) {}

        #[ink(message)]
        pub fn update_global_params(
            &mut self,
            _vote_duration: u128,
            _min_voters_need: u128,
            _upload_fee_per_work: u128,
        ) {}

        #[ink(message)]
        pub fn set_pledge_params(&mut self, _new_pw: u128, _new_pf: u128) {}

        #[ink(message)]
        pub fn get_vote_result(&self, _proposal_id: u128, _fail_num: u128) -> u8 { 0 }

        #[ink(message)]
        pub fn counting_vote(
            &self,
            _approve: u128,
            _against: u128,
            _power_supply: u128,
        ) -> bool { true }

        #[ink(message)]
        pub fn get_vote_data(&self, _proposal_id: u128, _fail_num: u128) {}

        #[ink(message)]
        pub fn can_modify_collection(&self, _proposal_id: u128) -> bool { true }

        #[ink(message)]
        pub fn get_proposal_ids_len(&self) -> u64 {
            self.proposal_ids.len() as u64
        }

        #[ink(message)]
        pub fn get_partial_proposal_ids(&self, _start_index: u64, _end_index: u64) {}

        #[ink(message)]
        pub fn get_all_proposal_ids(&self) {}

        #[ink(message)]
        pub fn get_user_proposal_ids_len(&self, _user: AccountId) {}

        #[ink(message)]
        pub fn get_partial_user_proposal_ids(
            &self,
            _user: AccountId,
            _start_index: u64,
            _end_index: u64,
        ) {}

        #[ink(message)]
        pub fn get_all_user_proposal_ids(&self, _user: AccountId) {}

        #[ink(message)]
        pub fn get_user_voted_list_len(&self, _user: AccountId) {}

        #[ink(message)]
        pub fn get_partial_user_voted_list(
            &self,
            _user: AccountId,
            _start_index: u64,
            _end_index: u64,
        ) {}

        #[ink(message)]
        pub fn get_proposal_info(&self, _proposal_id: u128) {}

        #[ink(message)]
        pub fn can_crowdfund(&self, _proposal_id: u128) {}
    }
}
