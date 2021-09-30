#![cfg_attr(not(feature = "std"), no_std)]

pub use self::erc20::Erc20;
use ink_lang as ink;

#[ink::contract]
mod erc20 {
    #[cfg(not(feature = "ink-as-dependency"))]
    use ink_storage::{
        collections::HashMap as StorageHashMap,
        lazy::Lazy
    };

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        InsufficientBalance,
        InsufficientAllowance,
        InvalidAmount,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    #[ink(storage)]
    pub struct Erc20 {
        total_supply: Lazy<Balance>,
        balances: StorageHashMap<AccountId, Balance>,
        allowances: StorageHashMap<(AccountId, AccountId), Balance>,
        rewards: StorageHashMap<AccountId, Balance>,
        owner: AccountId,
    }

    #[ink(event)]
    pub struct Transfer {
        #[ink(topic)]
        from: Option<AccountId>,
        #[ink(topic)]
        to: Option<AccountId>,
        #[ink(topic)]
        value: Balance, 
    }

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

    impl Erc20 {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {
                total_supply: Lazy::new(0),
                balances: StorageHashMap::new(),
                allowances: StorageHashMap::new(),
                rewards: StorageHashMap::new(),
                owner: Self::env().caller(),
            }
        }

        #[ink(message)]
        pub fn total_supply(&self) -> Balance {
            *self.total_supply
        }

        #[ink(message)]
        pub fn balance_of(&self, user: AccountId) -> Balance {
            self.balances.get(&user).copied().unwrap_or(0)
        }

        #[ink(message)]
        pub fn allowance(&self, owner: AccountId, spender: AccountId) -> Balance {
            self.allowances.get(&(owner, spender)).copied().unwrap_or(0)
        }

        #[ink(message)]
        pub fn approve(&mut self, spender: AccountId, value: Balance) -> Result<()> {
            let owner = self.env().caller();
            self.allowances.insert((owner, spender), value);
            self.env().emit_event( Approval {
                owner,
                spender,
                value,
            });
            Ok(())
        }

        #[ink(message)]
        pub fn transfer_from(
            &mut self, 
            from: AccountId, 
            to: AccountId, 
            value: Balance
        ) -> Result<()> {
            let spender = self.env().caller();
            let allowance = self.allowance(from, spender);
            if allowance < value {
                return Err(Error::InsufficientAllowance)
            }
            self.transfer_from_to(from, to, value)?;
            self.allowances.insert((from, spender), allowance - value);
            Ok(())
        }
        
        #[ink(message)]
        pub fn transfer(&mut self, to: AccountId, value: Balance) -> Result<()> {
            self.transfer_from_to(self.env().caller(), to, value)
        }


        #[ink(message)]
        pub fn reward(&self, user: AccountId) -> Balance {
            self.rewards.get(&user).copied().unwrap_or(0)
        }

        #[ink(message)]
        pub fn update_reward(&mut self, user: AccountId, amount: Balance) {
            self.rewards.insert(user, amount);
        }

        #[ink(message)]
        pub fn update_balance(&mut self, user: AccountId, value: Balance) {
            self.balances.insert(user, value);
        }

        #[ink(message)]
        pub fn mint(&mut self, user: AccountId, amount: Balance) -> Result<()> {
            self.only_owner();
            assert_ne!(user, Default::default());
            if amount <= 0 {
                return Err(Error::InvalidAmount)
            }
            let user_balance = self.balance_of(user);
            self.balances.insert(user, user_balance + amount);
            *self.total_supply += amount;
            self.env().emit_event( Mint { user, amount });
            Ok(())
        }

        #[ink(message)]
        pub fn burn(&mut self, user: AccountId, amount: Balance) -> Result<()> {
            self.only_owner();
            let user_balance = self.balance_of(user);
            if user_balance < amount {
                return Err(Error::InsufficientBalance)
            }
            self.balances.insert(user, user_balance - amount);
            *self.total_supply -= amount;
            self.env().emit_event( Burn { user, amount });
            Ok(())
        }

        fn transfer_from_to(
            &mut self, 
            from: AccountId, 
            to: AccountId, 
            value: Balance
        ) -> Result<()> {
            let from_balance = self.balance_of(from);
            if from_balance < value {
                return Err(Error::InsufficientBalance)
            }
            self.balances.insert(from, from_balance - value);

            let to_balance = self.balance_of(to);
            self.balances.insert(to, to_balance + value);
            self.env().emit_event( Transfer {
                from: Some(from),
                to: Some(to),
                value, 
            });
            Ok(())
        }

        fn only_owner(&self) {
            assert_eq!(self.env().caller(), self.owner);
        }

        #[ink(message)]
        pub fn transfer_ownership(&mut self, new_owner: AccountId) {
            self.only_owner();
            self.owner = new_owner;
        }
        
        #[ink(message)]
        pub fn owner(&self) -> AccountId {
            self.owner
        }
    }
}
