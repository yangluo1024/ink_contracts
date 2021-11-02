#![cfg_attr(not(feature = "std"), no_std)]
pub use self::oracle::{Oracle, OracleRef};
use ink_lang as ink;

#[ink::contract]
mod oracle {
    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        OnlyOwnerAccess,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    /// Defines the storage of your contract.
    /// Add new fields to the below struct in order
    /// to add new static storage fields to your contract.
    #[ink(storage)]
    pub struct Oracle {
        /// Stores a single `bool` value on the storage.
        elp_price: u128,  //all price decimals is 100000
        elc_price: u128,
        block_timestamp_last: u128,
        owner: AccountId,
    }

    impl Oracle {
        /// Constructor that initializes the `bool` value to the given `init_value`.
        #[ink(constructor)]
        pub fn new() -> Self {
            let caller = Self::env().caller();
            Self {
                elp_price: 0,
                elc_price: 0,
                block_timestamp_last: 0,
                owner: caller,
            }
        }

        /// update every hour, decimal is 100000
        #[ink(message)]
        pub fn update(&mut self, elp_price: u128, elc_price: u128) -> Result<()> {
            self.only_owner()?;
            self.elp_price = elp_price;
            self.elc_price =  elc_price;
            self.block_timestamp_last = Self::env().block_timestamp().into();
            Ok(())
        }

        #[ink(message)]
        pub fn elp_price(&self) -> u128 { self.elp_price }

        #[ink(message)]
        pub fn elc_price(&self) -> u128 { self.elc_price }

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
            let oracle = Oracle::new();
            let accounts = default_accounts();
            assert_eq!(oracle.elp_price(), 0);
            assert_eq!(oracle.elc_price(), 0);
            assert_eq!(oracle.block_timestamp_last, 0);
            assert_eq!(oracle.owner(), accounts.alice);
        }
        
        #[ink::test]
        fn update_works() {
            let mut oracle = Oracle::new();
            assert_eq!(oracle.elp_price(), 0);
            assert_eq!(oracle.elc_price(), 0);
            assert!(oracle.update(66, 99).is_ok());
            assert_eq!(oracle.elp_price(), 66);
            assert_eq!(oracle.elc_price(), 99);
        }

        #[ink::test]
        fn update_failed_when_not_owner() {
            let mut oracle = Oracle::new();
            let accounts = default_accounts();

            // Set bob as caller.
            let callee = account_id::<DefaultEnvironment>();
            let mut data = test::CallData::new(call::Selector::new([0x00; 4]));
            data.push_arg(&accounts.bob);
            test::push_execution_context::<DefaultEnvironment>(
                accounts.bob,
                callee,
                1000000,
                1000000,
                data,
            );
            assert_eq!(oracle.update(66, 99), Err(Error::OnlyOwnerAccess));
        }

        #[ink::test]
        fn transfer_ownership_works() {
            let mut oracle = Oracle::new();
            let accounts = default_accounts();
            assert!(oracle.transfer_ownership(accounts.bob).is_ok());
            assert_eq!(oracle.owner(), accounts.bob);
        } 

        #[ink::test]
        fn transfer_ownership_failed_when_not_owner() {
            let mut oracle = Oracle::new();
            let accounts = default_accounts();
            // 先将owner转移给bob
            assert!(oracle.transfer_ownership(accounts.bob).is_ok());
            // alice不再是owner,再调用transfer_ownership将会报错
            assert_eq!(oracle.transfer_ownership(accounts.charlie), Err(Error::OnlyOwnerAccess));
        } 
    }
}
