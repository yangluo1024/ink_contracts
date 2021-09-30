#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod sushitoken {
    use erc20::Erc20; 
    use ink_prelude::string::String;
    #[cfg(not(feature = "ink-as-denpendency"))]
    use ink_env::call::FromAccountId;
    use ink_storage::{
        collections::HashMap as StorageHashMap,
        lazy::Lazy,
    };

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error{
        InsufficientBalance,
        InvalidAmount,
        InsufficientPledge,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    #[ink(storage)]
    pub struct Sushitoken {
        name: Option<String>,
        symbol: Option<String>,
        decimals: Option<u8>,
        erc_contract: Lazy<Erc20>,
        erc_accountid: AccountId,
        total_pledge: Lazy<Balance>,
        // 总奖励：最终各用户得到的奖励总和要等于total_reward
        total_reward: Lazy<Balance>,
        // 各用户质押代币量
        pledges: StorageHashMap<AccountId, Balance>,
        // 各用户奖励负债
        reward_debts: StorageHashMap<AccountId, Balance>,
        // 每枚代币可领取的奖励
        acc_sushi_pershare: Lazy<Balance>,
        sushi_per_block: u128,
        last_reward_time: u128,
    }

    #[ink(event)]
    pub struct Deposit {
        user: AccountId,
        amount: Balance,
    }

    #[ink(event)]
    pub struct Withdraw {
        user: AccountId,
        amount: Balance,
    }

    impl Sushitoken {
        #[ink(constructor)]
        pub fn new(erc_token: AccountId) -> Self {
            let erc_contract: Erc20 = FromAccountId::from_account_id(erc_token);
            Self {
                name: Some(String::from("Sushi Token")),
                symbol: Some(String::from("sushi")),
                decimals: Some(12),
                erc_contract: Lazy::new(erc_contract),
                erc_accountid: erc_token,
                total_pledge: Lazy::new(0),
                total_reward: Lazy::new(0),
                pledges: StorageHashMap::new(),
                reward_debts: StorageHashMap::new(),
                acc_sushi_pershare: Lazy::new(0),
                sushi_per_block: 1000,
                last_reward_time: Self::env().block_timestamp().into(),
            }
        }

        #[ink(message)]
        pub fn get_time(&self) -> u128 {
            self.env().block_timestamp().into()
        }

        #[ink(message)]
        pub fn name(&self) -> Option<String> {
            self.name.clone()
        }

        #[ink(message)]
        pub fn symbol(&self) -> Option<String> {
            self.symbol.clone()
        }

        #[ink(message)]
        pub fn decimals(&self) -> Option<u8> {
            self.decimals
        }

        // 奖励负债，每次计算奖励时，需要减去的部分
        #[ink(message)]
        pub fn reward_debt(&self, user: AccountId) -> Balance {
            self.reward_debts.get(&user).copied().unwrap_or(0)
        }

        // 质押
        #[ink(message)]
        pub fn deposit(&mut self, user: AccountId, amount: Balance) -> Result<()> {
            let user_erc_balance = self.erc_contract.balance_of(user);
            if user_erc_balance < amount {
                return Err(Error::InsufficientBalance)
            }
            if amount <= 0 {
                return Err(Error::InvalidAmount)
            }
            // 清算当前奖励和更状态变量
            self.get_reward(user);

            // update pledges
            let user_pledge = self.pledge_of(user) + amount;
            self.pledges.insert(user, user_pledge);

            // update reward_debt
            let reward_debt = user_pledge * self.acc_sushi_pershare() / (1e12 as u128);
            self.reward_debts.insert(user, reward_debt);
            // update erc token
            self.erc_contract.update_balance(user, user_erc_balance - amount);

            *self.total_pledge += amount;
            self.env().emit_event(Deposit {user, amount});    
            Ok(())
        }

        // 撤回
        #[ink(message)]
        pub fn withdraw(&mut self, user: AccountId, amount: Balance) -> Result<()> {
            let user_pledge = self.pledge_of(user);
            if user_pledge < amount {
                return Err(Error::InsufficientPledge)
            }
            // 清算当前奖励和更新状态变量
            self.get_reward(user);
            // 更新余额和奖励负债
            self.pledges.insert(user, user_pledge - amount);
            self.reward_debts.insert(user, self.pledge_of(user) * self.acc_sushi_pershare() / (1e12 as u128));
            // update erc token
            let user_erc_balance = self.erc_contract.balance_of(user);
            self.erc_contract.update_balance(user, user_erc_balance + amount);

            *self.total_pledge -= amount;
            self.env().emit_event(Withdraw {user, amount});
            Ok(())
        }

        #[ink(message)]
        pub fn acc_sushi_pershare(&self) -> Balance {
            *self.acc_sushi_pershare
        }

        #[ink(message)]
        pub fn total_reward(&self) -> Balance {
            *self.total_reward
        }

        #[ink(message)]
        pub fn total_pledge(&self) -> Balance {
            *self.total_pledge
        }

        #[ink(message)]
        pub fn pledge_of(&self, user: AccountId) -> Balance {
            self.pledges.get(&user).copied().unwrap_or(0)
        } 

        fn get_reward(&mut self, user: AccountId) {
            let now_time = self.env().block_timestamp().into();
            if self.total_pledge() > 0 {
                // 每出一个块，奖励1000，3s出块的速度，可算得当前奖励
                let award_amount = ((now_time - self.last_reward_time) / (1000 * 3)) * self.sushi_per_block;
                // 只有当有奖励时，才对各状态变量进行更新
                if award_amount > 0 {
                    // update `acc_sushi_pershare` and `last_reward_time` and `total_reward`.
                    self.mint(award_amount, now_time);
                    let old_reward = self.erc_contract.reward(user);
                    let reward_all = self.pledge_of(user) * self.acc_sushi_pershare() / (1e12 as u128);
                    let new_reward = reward_all - self.reward_debt(user);
                    self.erc_contract.update_reward(user, old_reward + new_reward);
                }
            } else {
                // 首次存入数据，更新奖励时间为当前时间
                self.last_reward_time = now_time;
            }
        }

        fn mint(&mut self, amount: Balance, now_time: u128) {
            let total = self.total_pledge(); 
            let acc_sushi_pershare = self.acc_sushi_pershare();
            let convertion_factor = (10 as u128).saturating_pow(self.decimals.unwrap() as u32);
            *self.acc_sushi_pershare = amount * convertion_factor / total + acc_sushi_pershare; 

            // update mint time and total_reward
            *self.total_reward += amount;
            self.last_reward_time = now_time;
        }
    }
}
