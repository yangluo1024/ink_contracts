#![cfg_attr(not(feature = "std"), no_std)]

pub use self::reward::Reward;
use ink_lang as ink;

#[ink::contract]
mod reward {
    #[cfg(not(feature = "ink-as-dependency"))]
    use ink_storage::{
        collections::HashMap as StorageHashMap,
        lazy::Lazy,
    };
    use ink_storage::traits::{SpreadLayout, PackedLayout};

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        OnlyOwnerAccess,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    #[derive(Clone, Debug, PartialEq, Eq, scale::Encode,scale::Decode, SpreadLayout, PackedLayout)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink_storage::traits::StorageLayout))]
    pub struct RecordInfo {
        // 记录上一次奖励时，日奖励量，初始值为20000ELP, 日递减1%
        pub day_award: u128,
        // 记录上一次奖励时，整除日出块28800后，不足一日的小部分区块区间奖励
        pub block_award: u128,
        // 记录上一次奖励时，整除日出块28800时的最后单元日的时间点
        // day_time + time_of(block_reward) = last_reward_time
        pub day_time: u128,
    }

    /// Defines the storage of your contract.
    /// Add new fields to the below struct in order
    /// to add new static storage fields to your contract.
    #[ink(storage)]
    pub struct Reward {
        // 当前区块总奖励
        total_reward: Lazy<Balance>,
        // 当前各用户已获得的奖励
        // 当所有用户撤销质押量，即balances为空时，rewards.sum()应该和total_reward相等
        rewards: StorageHashMap<AccountId, Balance>,
        // 当前各用户奖励负债(all_reward_for_user - reward_debt = delta_reward_for_user)
        reward_debts: StorageHashMap<AccountId, Balance>,
        // 当前每区块对应奖励量
        acc_elp_pershare: Lazy<Balance>,
        // 记录上一次奖励相关的时间点信息
        last_record: RecordInfo,
        owner: AccountId,
    }

    impl Reward {
        /// Constructor that initializes the `bool` value to the given `init_value`.
        #[ink(constructor)]
        pub fn new() -> Self {
            let owner = Self::env().caller();
            // 首日总出矿量20000，放大倍数，防止计算出现浮点数
            let day_award = 20000 * 1e8 as u128;
            let block_award = 0;
            let day_time = Self::env().block_timestamp().into();
            let last_record = RecordInfo {
                day_award,
                block_award,
                day_time,
            };
            Self { 
                total_reward: Lazy::new(0),
                rewards: StorageHashMap::new(),
                reward_debts: StorageHashMap::new(),
                acc_elp_pershare: Lazy::new(0),
                last_record,
                owner,
            }
        }

        #[ink(message)]
        pub fn total_reward(&self) -> Balance {
            *self.total_reward
        }

        #[ink(message)]
        pub fn reward_of(&self, user: AccountId) -> Balance {
            self.rewards.get(&user).copied().unwrap_or(0)
        }

        #[ink(message)]
        pub fn reward_debt_of(&self, user: AccountId) -> Balance {
            self.reward_debts.get(&user).copied().unwrap_or(0)
        }

        #[ink(message)]
        pub fn acc_elp_pershare(&self) -> Balance {
            *self.acc_elp_pershare
        }

        #[ink(message)]
        pub fn get_last_record(&self) -> RecordInfo {
            self.last_record.clone()
        }

        #[ink(message)]
        pub fn update_reward_debts(
            &mut self, 
            user: AccountId, 
            amount: Balance
        ) -> Result<()> {
            self.only_owner()?;
            self.reward_debts.insert(user, amount);
            Ok(())
        }
        
        #[ink(message)]
        // total: new total_reward,
        // reward: new reward of user
        // amount: new acc_elp_pershare
        pub fn update_reward_infos(
            &mut self,
            total: Balance,
            user: AccountId,
            reward: Balance,
            amount: Balance
        ) -> Result<()> {
            self.only_owner()?;

            *self.total_reward = total;
            self.rewards.insert(user, reward);
            *self.acc_elp_pershare = amount;
            Ok(())
        }

        #[ink(message)]
        pub fn update_last_record_infos(
            &mut self,
            day_award: u128,
            block_award: u128,
            day_time: u128
        ) -> Result<()> {
            self.only_owner()?;
            let record = RecordInfo {
                day_award,
                block_award,
                day_time,
            };
            self.last_record = record;
            Ok(())
        }
        
        // TODO: 取回ELP, 奖励的ELP全部在合约地址下，根据rewards来分发给各个用户
        // #[ink(message)]
        // pub get_back_reward(&mut self) {}

        #[ink(message)]
        pub fn owner(&self) -> AccountId {
            self.owner
        }

        #[ink(message)]
        pub fn transfer_ownership(&mut self, new_owner: AccountId) -> Result<()> {
            self.only_owner()?;
            self.owner = new_owner;
            Ok(())
        }

        fn only_owner(&self) -> Result<()> {
            if self.env().caller() != self.owner {
                return Err(Error::OnlyOwnerAccess);
            }
            Ok(())
        }
    }

    /// Unit tests.
    #[cfg(test)]
    mod tests {
        /// Imports all the definitions from outer so we can use them here.
        use super::*;
        use ink_lang as ink;
        use ink_env::{test, call, account_id, DefaultEnvironment};

        type Accounts = test::DefaultAccounts<DefaultEnvironment>;

        fn default_accounts() -> Accounts {
            test::default_accounts().expect("Cannot get accounts.")
        }

        #[ink::test]
        fn new_works() {
            let reward = Reward::new();
            let accounts = default_accounts();
            assert_eq!(reward.total_reward(), 0);
            assert_eq!(reward.reward_of(accounts.alice), 0);
            assert_eq!(reward.reward_debt_of(accounts.alice), 0);
            assert_eq!(reward.acc_elp_pershare(), 0);
            assert_eq!(reward.owner(), accounts.alice);
        }

        #[ink::test]
        fn update_reward_debts_works() {
            let mut reward = Reward::new();
            let accounts = default_accounts();
            assert!(reward.update_reward_debts(accounts.alice, 1000).is_ok());
            assert_eq!(reward.reward_debt_of(accounts.alice), 1000);
        }

        #[ink::test]
        fn update_reward_debts_failed() {
            let mut reward = Reward::new();
            let accounts = default_accounts();
            // 转移owner至bob
            assert!(reward.transfer_ownership(accounts.bob).is_ok()); 
            // caller: alice, owner: bob
            assert_eq!(reward.update_reward_debts(accounts.bob, 999), Err(Error::OnlyOwnerAccess));
        }

        #[ink::test]
        fn update_reward_infos_works() {
            let mut reward = Reward::new();
            let accounts = default_accounts();
            assert!(reward.update_reward_infos(
                5000,
                accounts.alice,
                1000,
                66
            ).is_ok());
            assert_eq!(reward.total_reward(), 5000);
            assert_eq!(reward.reward_of(accounts.alice), 1000);
            assert_eq!(reward.acc_elp_pershare(), 66);
        }

        #[ink::test]
        fn update_reward_infos_failed() {
            let mut reward = Reward::new();
            let accounts = default_accounts();
            // 转移owner至bob
            assert!(reward.transfer_ownership(accounts.bob).is_ok()); 
            // caller: alice, owner: bob
            assert_eq!(reward.update_reward_infos(
                5000,
                accounts.bob,
                999,
                66
            ), Err(Error::OnlyOwnerAccess));
        }

        #[ink::test]
        fn update_last_record_infos_works() {
            let mut reward = Reward::new();
            assert!(reward.update_last_record_infos(
                28800,
                888,
                16669900
            ).is_ok());
            assert_eq!(reward.last_record.day_award, 28800);
            assert_eq!(reward.last_record.block_award, 888);
            assert_eq!(reward.last_record.day_time, 16669900);
        }

        #[ink::test]
        fn update_last_record_infos_failed() {
            let mut reward = Reward::new();
            let accounts = default_accounts();
            // 转移owner至bob
            assert!(reward.transfer_ownership(accounts.bob).is_ok()); 
            // caller: alice, owner: bob
            assert_eq!(reward.update_last_record_infos(
                28800,
                999,
                66999900
            ), Err(Error::OnlyOwnerAccess));
        }

        #[ink::test]
        fn transfer_ownership_works() {
            let mut reward = Reward::new();
            let accounts = default_accounts();
            assert!(reward.transfer_ownership(accounts.bob).is_ok());
            assert_eq!(reward.owner(), accounts.bob);
        }

        #[ink::test]
        fn transfer_ownership_failed_when_not_owner() {
            let mut reward = Reward::new();
            let accounts = default_accounts();

            // set bob as caller
            // Get contract address
            let callee = account_id::<DefaultEnvironment>().unwrap_or_else(|_| [0x0; 32].into());
            // Create call
            let mut data = test::CallData::new(call::Selector::new([0x00; 4]));
            data.push_arg(&accounts.bob);
            // Push the new execution to set Bob as caller.
            test::push_execution_context::<DefaultEnvironment>(
                accounts.bob,
                callee,
                1000000,
                1000000,
                data,
            );
            // bob is caller, but owner is still alice
            assert_eq!(reward.transfer_ownership(accounts.bob), Err(Error::OnlyOwnerAccess));
        }
    }
}
