#![cfg_attr(not(feature = "std"), no_std)]

pub use self::relp::RELP;
use ink_lang as ink;

#[ink::contract]
mod relp {
    #[cfg(not(feature = "ink-as-dependency"))]
    use elc::ELC;
    #[cfg(not(feature = "ink-as-dependency"))]
    use reward::Reward;
    #[cfg(not(feature = "ink-as-dependency"))]
    use additional::Additional;
    use ink_prelude::{string::String};
    #[cfg(not(feature = "ink-as-dependency"))]
    use ink_storage::{
        collections::HashMap as StorageHashMap,
        lazy::Lazy,
    };
    #[cfg(not(feature = "ink-as-dependency"))]
    use ink_env::call::FromAccountId;

    /// The RELP error types.
    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        InsufficientFreeBalance,
        InsufficientSupply,
        InvalidAmount,
        InsufficientAllowance,
        OnlyOwnerAccess,
    }

    /// The RELP result type.
    pub type Result<T> = core::result::Result<T, Error>;

    #[ink(storage)]
    pub struct RELP {
        /// Name of the token
        name: Option<String>,
        /// Symbol of the token
        symbol: Option<String>,
        /// Decimals of the token
        decimals: Option<u8>,
        /// Total token supply.
        total_supply: Lazy<Balance>,
        /// Mapping from owner to number of owned token.
        balances: StorageHashMap<AccountId, Balance>,
        /// Mapping from owner to a tuple(block_number, lock_balance).
        lock_infos: StorageHashMap<AccountId, (u32, Balance)>,
        /// Mapping of the token amount which an account is allowed to withdraw
        /// from another account.
        allowances: StorageHashMap<(AccountId, AccountId), Balance>,
        /// elc token contract
        elc_contract: Lazy<ELC>,
        /// reward contract
        reward_contract: Lazy<Reward>,
        /// additional contract
        add_contract: Lazy<Additional>,
        /// The contract owner, provides basic authorization control
        /// functions, this simplifies the implementation of "user permissions".
        owner: AccountId,
    }

    /// Event emitted when a token transfer occurs.
    #[ink(event)]
    pub struct Transfer {
        #[ink(topic)]
        from: Option<AccountId>,
        #[ink(topic)]
        to: Option<AccountId>,
        #[ink(topic)]
        value: Balance,
    }

    /// Event emitted when an approval occurs that `spender` is allowed to withdraw
    /// up to the amount of `value` tokens from `owner`.
    #[ink(event)]
    pub struct Approval {
        #[ink(topic)]
        owner: AccountId,
        #[ink(topic)]
        spender: AccountId,
        #[ink(topic)]
        value: Balance,
    }

    #[ink(event)]
    pub struct Mint {
        #[ink(topic)]
        user: AccountId,
        #[ink(topic)]
        amount: Balance,
    }

    #[ink(event)]
    pub struct Burn {
        #[ink(topic)]
        user: AccountId,
        #[ink(topic)]
        amount: Balance,
    }

    impl RELP {
        #[ink(constructor)]
        pub fn new(
            elc_token: AccountId, 
            reward_addr: AccountId, 
            additional_addr: AccountId
        ) -> Self {
            let caller = Self::env().caller();
            let name: Option<String> = Some(String::from("Risk Reserve of ELP"));
            let symbol: Option<String> = Some(String::from("rELP"));
            let decimals: Option<u8> = Some(8);
            let elc_contract: ELC = FromAccountId::from_account_id(elc_token);
            let reward_contract: Reward = FromAccountId::from_account_id(reward_addr);
            let add_contract: Additional = FromAccountId::from_account_id(additional_addr);
            Self {
                name,
                symbol,
                decimals,
                total_supply: Lazy::new(0),
                balances: StorageHashMap::new(),
                lock_infos: StorageHashMap::new(),
                allowances: StorageHashMap::new(),
                elc_contract: Lazy::new(elc_contract),
                reward_contract: Lazy::new(reward_contract),
                add_contract: Lazy::new(add_contract),
                owner: caller,
            }
        }

        /// Returns the token name.
        #[ink(message)]
        pub fn token_name(&self) -> Option<String> {
            self.name.clone()
        }

        /// Returns the token symbol.
        #[ink(message)]
        pub fn token_symbol(&self) -> Option<String> {
            self.symbol.clone()
        }

        /// Returns the token decimals.
        #[ink(message)]
        pub fn token_decimals(&self) -> Option<u8> {
            self.decimals
        }

        /// Returns the total token supply.
        #[ink(message)]
        pub fn total_supply(&self) -> Balance {
            *self.total_supply
        }

        /// Returns the account balance for the specified `owner`.
        ///
        /// Returns `0` if the account is non-existent.
        #[ink(message)]
        pub fn balance_of(&self, owner: AccountId) -> Balance {
            self.balances.get(&owner).copied().unwrap_or(0)
        }

        #[ink(message)]
        pub fn lock_info_of(&self, user: AccountId) -> (u32, Balance) {
            self.lock_infos.get(&user).copied().unwrap_or((0, 0))
        }

        #[ink(message)]
        pub fn update_lock_infos(&mut self, user: AccountId, lock_info: (u32, Balance)) -> Result<()> {
            self.only_owner()?;
            self.lock_infos.insert(user, lock_info);
            Ok(())
        }

        /// Transfers `value` amount of tokens from the caller's account to account `to`.
        ///
        /// On success a `Transfer` event is emitted.
        ///
        /// # Errors
        ///
        /// Returns `InsufficientBalance` error if there are not enough tokens on
        /// the caller's account balance.
        #[ink(message)]
        pub fn transfer(&mut self, to: AccountId, value: Balance) -> Result<()> {
            let from = self.env().caller();
            self.transfer_from_to(from, to, value)
        }

        /// Returns the amount which `spender` is still allowed to withdraw from `owner`.
        ///
        /// Returns `0` if no allowance has been set `0`.
        #[ink(message)]
        pub fn allowance(&self, owner: AccountId, spender: AccountId) -> Balance {
            self.allowances.get(&(owner, spender)).copied().unwrap_or(0)
        }

        /// Transfers `value` tokens on the behalf of `from` to the account `to`.
        ///
        /// This can be used to allow a contract to transfer tokens on ones behalf and/or
        /// to charge fees in sub-currencies, for example.
        ///
        /// On success a `Transfer` event is emitted.
        ///
        /// # Errors
        ///
        /// Returns `InsufficientAllowance` error if there are not enough tokens allowed
        /// for the caller to withdraw from `from`.
        ///
        /// Returns `InsufficientBalance` error if there are not enough tokens on
        /// the the account balance of `from`.
        #[ink(message)]
        pub fn transfer_from(&mut self, from: AccountId, to: AccountId, value: Balance) -> Result<()> {
            let caller = self.env().caller();
            let allowance = self.allowance(from, caller);
            if allowance < value {
                return Err(Error::InsufficientAllowance);
            }
            self.transfer_from_to(from, to, value)?;
            self.allowances.insert((from, caller), allowance - value);
            Ok(())
        }

        /// Allows `spender` to withdraw from the caller's account multiple times, up to
        /// the `value` amount.
        ///
        /// If this function is called again it overwrites the current allowance with `value`.
        ///
        /// An `Approval` event is emitted.
        #[ink(message)]
        pub fn approve(&mut self, spender: AccountId, value: Balance) -> Result<()> {
            let owner = self.env().caller();
            self.allowances.insert((owner, spender), value);
            self.env().emit_event(Approval {
                owner,
                spender,
                value,
            });
            Ok(())
        }

        /// Mint a new amount of tokens
        /// these tokens are deposited into the owner address
        #[ink(message)]
        pub fn mint(&mut self, user: AccountId, amount: Balance) -> Result<()> {
            self.only_owner()?;
            if amount <= 0 {
                return Err(Error::InvalidAmount);
            }

            let user_balance = self.balance_of(user);
            // calculate ELC reward
            let (timestamp, index) = self.get_elc_reward(user);
            self.increase_coinday_info(user, timestamp, index);

            self.get_elp_reward(user, Default::default());
            self.balances.insert(user, user_balance + amount); 
            self.update_elp_reward_debt(user);
            
            // update total coinday
            self.update_total_info(timestamp, 0);
            *self.total_supply += amount;
            self.env().emit_event(Mint { user, amount });
            Ok(())
        }

        /// Burn tokens.
        /// These tokens are withdrawn from the owner address
        /// if the balance must be enough to cover the redeem
        /// or the call will fail.
        #[ink(message)]
        pub fn burn(&mut self, user: AccountId, amount: Balance) -> Result<()> {
            self.only_owner()?;
            if *self.total_supply < amount {
                return Err(Error::InsufficientSupply);
            }

            let user_balance = self.balance_of(user);
            let (_, lock_balance) = self.lock_info_of(user);
            if user_balance - lock_balance < amount {
                return Err(Error::InsufficientFreeBalance);
            }

            // calculate ELC reward
            let (timestamp, index) = self.get_elc_reward(user);
            let decrease = self.decrease_coinday_info(user, amount, timestamp, index);

            // calculate ELP reward
            self.get_elp_reward(user, Default::default());
            self.balances.insert(user, user_balance - amount); 
            self.update_elp_reward_debt(user);
            
            // update total coinday
            self.update_total_info(timestamp, decrease);
            *self.total_supply -= amount;
            self.env().emit_event(Burn { user, amount });
            Ok(())
        }

        /// Transfers `value` amount of tokens from the caller's account to account `to`.
        ///
        /// On success a `Transfer` event is emitted.
        ///
        /// # Errors
        ///
        /// Returns `InsufficientBalance` error if there are not enough tokens on
        /// the caller's account balance.
        fn transfer_from_to(
            &mut self,
            from: AccountId,
            to: AccountId,
            value: Balance,
        ) -> Result<()> {
            let from_balance = self.balance_of(from);
            let (_, lock_balance) = self.lock_info_of(from);
            if from_balance - lock_balance < value {
                return Err(Error::InsufficientFreeBalance);
            }
            // Calculate current ELC rewards
            let (time_from, index_from) = self.get_elc_reward(from);
            let decrease = self.decrease_coinday_info(from, value, time_from, index_from);

            // Calculate current ELP rewards
            self.get_elp_reward(from, to);
            self.balances.insert(from, from_balance - value);
            self.update_elp_reward_debt(from);


            let to_balance = self.balance_of(to);

            // Calculate current ELC rewards
            let (time_to, index_to) = self.get_elc_reward(to);
            self.increase_coinday_info(to, time_to, index_to);

            // Calculate current ELP rewards
            // self.get_elp_reward(to);
            self.balances.insert(to, to_balance + value);
            self.update_elp_reward_debt(to);
            
            // update total coinday
            self.update_total_info(time_to, decrease);
            self.env().emit_event(Transfer {
                from: Some(from),
                to: Some(to),
                value,
            });
            Ok(())
        }

        fn only_owner(&self) -> Result<()> {
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(Error::OnlyOwnerAccess)
            }
            Ok(())
        }

        /// Contract owner.
        #[ink(message)]
        pub fn owner(&self) -> AccountId {
            self.owner
        }

        /// transfer contract ownership to new owner.
        #[ink(message)]
        pub fn transfer_ownership(&mut self, new_owner: AccountId) -> Result<()> {
            self.only_owner()?;
            self.owner = new_owner;
            Ok(())
        }

        // TODO: 此函数只用于redspot测试，因stable合约无法测试，在此增加接口用于获取ELC增发奖励
        // 后续删除此函数
        #[ink(message)]
        pub fn relp_update_awards(&mut self, elc_amount: u128) {
            let _ = self.only_owner();
            let now_time = self.env().block_timestamp().into();
            let (cur_total_coinday, last_time) = self.add_contract.total_coinday();
            let total_supply = self.total_supply();
            let increase_coinday = total_supply * (now_time - last_time);
            let new_total_coinday = cur_total_coinday + increase_coinday;
            // update total coinday
            assert!(self.add_contract.update_total_coinday((new_total_coinday, now_time)).is_ok());
            // let per_coinday = elc_amount * 1e12 as u128 / new_total_coinday;
            // let new_value = (per_coinday, now_time);
            assert!(self.add_contract.update_awards(elc_amount, new_total_coinday, now_time).is_ok());
        }

        // 更新状态
        fn update_elp_reward_debt(&mut self, user: AccountId) {
            let user_balance = self.balance_of(user);
            let reward_debt = user_balance * self.reward_contract.acc_elp_pershare();
            assert!(self.reward_contract.update_reward_debts(user, reward_debt).is_ok());
        }

        // 领取奖励
        fn get_elp_reward(&mut self, user: AccountId, user2: AccountId) {
            let total_supply = self.total_supply();
            let now_time = self.env().block_timestamp().into();
            if total_supply > 0 {
                let delta_award = self.get_delta_reward(now_time);
                if delta_award > 0 {
                    // calculate new `acc_elp_pershare`
                    let acc_elp_pershare = self.reward_contract.acc_elp_pershare();
                    let delta_acc_elp_pershare = delta_award / total_supply;
                    let new_acc_elp_pershare = acc_elp_pershare + delta_acc_elp_pershare;

                    // calculate new `total_reward`
                    let total_reward = self.reward_contract.total_reward();
                    let new_total_reward = total_reward + delta_award;

                    self.update_user_reward(new_total_reward, user, delta_award, new_acc_elp_pershare);
                    if user2 != Default::default() {
                        self.update_user_reward(new_total_reward, user2, delta_award, new_acc_elp_pershare);
                    }
                }
            } else {
                // just update time
                let last_record = self.reward_contract.get_last_record();
                assert!(self.reward_contract.update_last_record_infos(
                    last_record.day_award, 
                    last_record.block_award, 
                    now_time
                ).is_ok());
            }
        }
        
        fn update_user_reward(
            &mut self, 
            new_total_reward: u128,
            user: AccountId, 
            delta_award: u128,
            new_acc_elp_pershare: u128,
        ) {
            // calculate new reward of user
            let user_balance = self.balance_of(user);
            let old_reward = self.reward_contract.reward_of(user);
            let reward_debt = self.reward_contract.reward_debt_of(user);
            let reward_all = user_balance * new_acc_elp_pershare;
            let new_reward = old_reward + reward_all - reward_debt;

            // update elp raward infos
            assert!(self.reward_contract.update_reward_infos(
                new_total_reward, 
                user, new_reward, 
                new_acc_elp_pershare
            ).is_ok());
        }

        fn get_delta_reward(&mut self, now_time: u128) -> Balance {
            // 从上次整数天奖励的区块高度算起，得到相对区块高度，从而算出截止当前交易产生的delta award.
            let last_record = self.reward_contract.get_last_record();
            let cur_days_reward_time = last_record.day_time;
            let relative_block_height_period = now_time - cur_days_reward_time;
            // TODO: 此处默认是3s出块，对应的日出块就是28800, 后续优化
            let block_each = 3 * 1000;
            let mut days = relative_block_height_period / (28800 * block_each);

            // 得到当前日奖励额award
            let (mut award, mut sum) = (last_record.day_award, 0);
            // 当日出块奖励为0时，即200万奖励已经分发完，直接返回0
            if award == 0 { return 0 }

            // 保存交易最近整数天的时间点，用于更新
            let new_last_days_reward_time = cur_days_reward_time + days * 24 * 3600 * 1000;

            // 记录除整数天外，多余区块数block_nums, 如交易当天0点后的出块数，用于计算last_blocks_reward
            let block_nums_period = relative_block_height_period - 28800 * days * block_each;
            // 消耗days，计算离上次最近整数天区间的整数天出块总奖励sum, 以及交易当天日出块奖励award值
            while days > 0 {
                if award == 0 { break }
                sum += award;
                award = award * 99 / 100;
                days -= 1;
            }

            let cur_last_blocks_reward = last_record.block_award;
            let new_last_blocks_reward = award * block_nums_period / (28800 * block_each);  

            // update `last_day_reward_amount`, `last_blocks_reward`
            assert!(self.reward_contract.update_last_record_infos(
                award, 
                new_last_blocks_reward, 
                new_last_days_reward_time
            ).is_ok());
            
            // calculate `delta_award` and return it.
            sum + new_last_blocks_reward - cur_last_blocks_reward
        }

        fn get_elc_reward(&mut self, user: AccountId) -> (u128, u32) {
            // calculate reward to mint elc
            let balance = self.balance_of(user);
            assert!(balance > 0, "need balance > 0");

            let coinday_info = self.add_contract.get_coinday_info(user);
            let awards = self.add_contract.awards();
            let (index, add_times) = (coinday_info.last_index as usize, awards.len());
            let now_time = self.env().block_timestamp().into();
            let (mut elc_amount, mut ret_index) = (0, add_times);
            for i in index..add_times {
                // 一次最多领取50个区间奖励
                if (i - index) >= 50 {
                    ret_index = i;
                    break; 
                }

                // 计算截止每一期奖励时间点，用户的币天数
                let coinday_i = coinday_info.amount + balance * (awards[i].timestamp - coinday_info.timestamp);

                // 每一期用户所得奖励额 = 当前期时间点下用户的币天数 * 每一期每币天奖励额
                // elc_amount += coinday_i * awards[i].0; 
                
                // if `awards` is a three elements tuple(elc_amount, cur_total_coinday, timestamp)
                // TODO: 扩大了10**8，后续再考虑缩放
                elc_amount += coinday_i * awards[i].amount * 1e8 as u128 / awards[i].total_coinday;
            }

            // mint elc for user
            if elc_amount > 0 {
                assert!(self.elc_contract.mint(user, elc_amount).is_ok());
            }
            (now_time, ret_index as u32)
        }

        fn decrease_coinday_info(
            &mut self, 
            user: AccountId, 
            value: Balance, 
            now_time: u128,
            index: u32
        ) -> u128 {
            let balance = self.balance_of(user);
            let coinday_info = self.add_contract.get_coinday_info(user);
            // 先将币天更新到当前时间点
            let cur_coinday = coinday_info.amount + balance * (now_time - coinday_info.timestamp);
            // decrease amount = coinday of user * ( value / balance );
            let decrease_coinday = cur_coinday * (value * 1e8 as u128 / balance) / 1e8 as u128; 
            let new_coinday = cur_coinday - decrease_coinday;
            assert!(self.add_contract.update_coindays(user, new_coinday, now_time, index).is_ok());
            decrease_coinday
        }

        fn increase_coinday_info(
            &mut self, 
            user: AccountId, 
            now_time: u128,
            index: u32
        ) {
            let balance = self.balance_of(user);
            let coinday_info = self.add_contract.get_coinday_info(user);
            let new_coinday = coinday_info.amount + balance * (now_time - coinday_info.timestamp);
            assert!(self.add_contract.update_coindays(user, new_coinday, now_time, index).is_ok());
        }

        fn update_total_info(&mut self, timestamp: u128, decrease: u128) {
            let total_info = self.add_contract.total_coinday();
            let increase_coinday = self.total_supply() * (timestamp - total_info.1);
            let new_total_coinday = total_info.0 + increase_coinday - decrease;
            assert!(self.add_contract.update_total_coinday((new_total_coinday, timestamp)).is_ok());
        }
    }

    /// Unit tests.
    #[cfg(test)]
    mod tests {
        /// Imports all the definitions from the outer scope so we can use them here.
        use super::*;
        use ink_lang as ink;
        use ink_env::{test, call, account_id, DefaultEnvironment};

        type Accounts = test::DefaultAccounts<DefaultEnvironment>;

        fn default_accounts() -> Accounts {
            test::default_accounts().expect("Cannot get accounts.") 
        }
        
        /// The default constructor does its job.
        #[ink::test]
        fn new_works() {
            let relp = RELP::new(
                AccountId::from([0x1; 32]), 
                AccountId::from([0x2; 32]), 
                AccountId::from([0x3; 32]));
            let accounts = default_accounts();
            assert_eq!(
                relp.token_name().unwrap_or_else(|| "Error name".to_string()), 
                "Risk Reserve of ELP".to_string());
            assert_eq!(
                relp.token_symbol().unwrap_or_else(|| "Error symbol".to_string()), 
                "rELP".to_string());
            assert_eq!(relp.token_decimals().unwrap_or(0), 8);
            assert_eq!(relp.total_supply(), 0);
            assert_eq!(relp.balance_of(accounts.alice), 0);
            assert_eq!(relp.lock_info_of(accounts.alice), (0, 0));
            assert_eq!(relp.owner(), accounts.alice);
        }

        #[ink::test]
        fn update_lock_infos_works() {
            let mut relp = RELP::new(
                AccountId::from([0x01; 32]),
                AccountId::from([0x02; 32]),
                AccountId::from([0x03; 32])
            );
            let accounts = default_accounts();
            assert!(relp.update_lock_infos(accounts.alice, (100, 5000)).is_ok());
            assert_eq!(relp.lock_info_of(accounts.alice), (100, 5000));
        }

        #[ink::test]
        fn update_lock_infos_failed() {
            let mut relp = RELP::new(
                AccountId::from([0x01; 32]),
                AccountId::from([0x02; 32]),
                AccountId::from([0x03; 32])
            );
            let accounts = default_accounts();
            assert!(relp.transfer_ownership(accounts.bob).is_ok());
            assert_eq!(
                relp.update_lock_infos(accounts.alice, (100, 5000)),
                Err(Error::OnlyOwnerAccess)
            );
        }

        #[ink::test]
        fn allowance_works() {
            let mut relp = RELP::new(
                AccountId::from([0x1; 32]), 
                AccountId::from([0x2; 32]), 
                AccountId::from([0x3; 32]));
            let accounts = default_accounts();
            assert_eq!(relp.allowance(accounts.alice, accounts.bob), 0);
            assert!(relp.approve(accounts.bob, 50).is_ok());
            assert_eq!(relp.allowance(accounts.alice, accounts.bob), 50);
        }

        #[ink::test]
        fn approve_works() {
            let mut relp = RELP::new(
                AccountId::from([0x1; 32]), 
                AccountId::from([0x2; 32]), 
                AccountId::from([0x3; 32]));
            let accounts = default_accounts();
            assert!(relp.approve(accounts.bob, 66).is_ok());
            assert_eq!(relp.allowance(accounts.alice, accounts.bob), 66);
        }

        #[ink::test]
        fn transfer_ownership_works() {
            let mut relp = RELP::new(
                AccountId::from([0x1; 32]), 
                AccountId::from([0x2; 32]), 
                AccountId::from([0x3; 32]));
            let accounts = default_accounts();
            assert!(relp.transfer_ownership(accounts.bob).is_ok());
            assert_eq!(relp.owner(), accounts.bob);
        }

        #[ink::test]
        fn transfer_ownership_failed_when_not_owner() {
            let mut relp = RELP::new(
                AccountId::from([0x1; 32]), 
                AccountId::from([0x2; 32]), 
                AccountId::from([0x3; 32]));
            let accounts = default_accounts();

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

            assert_eq!(relp.transfer_ownership(accounts.bob), Err(Error::OnlyOwnerAccess));
        }
    }
}
