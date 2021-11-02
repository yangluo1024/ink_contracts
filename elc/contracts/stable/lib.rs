#![cfg_attr(not(feature = "std"), no_std)]
#![allow(non_snake_case)]
#![allow(unused_mut)]

pub use self::stable::Stable;
use ink_lang as ink;
#[ink::contract]
mod stable {
    use elc::ELCRef;
    use relp::RELPRef;
    use oracle::OracleRef;
    use govern::GovernRef;
    use additional::AdditionalRef;
    use exchange2::PatraExchange2Ref;

    // #[cfg(not(feature = "ink-as-dependency"))]
    use ink_env::call::FromAccountId;
    // #[cfg(not(feature = "ink-as-dependency"))]
    use ink_storage::lazy::Lazy;

    #[ink(storage)]
    pub struct Stable {
        // ELP储备金
        reserve: u128,
        // ELP风险准备金
        risk_reserve: u128,
        // ELC风险准备金
        elc_risk_reserve_source: u128,
        // ELC储备金
        elc_reserve_source: u128,
        // 上次ELC扩张时间
        last_expand_time: u128,
        // 上次ELC收缩时间
        last_contract_time: u128,
        // 两次扩张或收缩时间间隔
        adjust_gap: u128,
        elc_contract: Lazy<ELCRef>,
        relp_contract: Lazy<RELPRef>,
        govern_contract: Lazy<GovernRef>,
        oracle_contract: Lazy<OracleRef>,
        add_contract: Lazy<AdditionalRef>,
        exchange_contract: Lazy<PatraExchange2Ref>,
        exchange_accountid: AccountId,
    }

    #[ink(event)]
    pub struct AddLiquidity {
        #[ink(topic)]
        sender: AccountId,
        #[ink(topic)]
        elp_amount: u128,
        #[ink(topic)]
        relp_amount: u128,
        #[ink(topic)]
        elc_amount: u128,
    }

    #[ink(event)]
    pub struct RemoveLiquidity {
        #[ink(topic)]
        sender: AccountId,
        #[ink(topic)]
        relp_amount: u128,
        #[ink(topic)]
        elc_amount: u128,
        #[ink(topic)]
        elp_amount: u128,
    }

    #[ink(event)]
    pub struct ExpandEvent {
        #[ink(topic)]
        elc_reserve_amount: u128,
        #[ink(topic)]
        elc_risk_amount: u128,
        #[ink(topic)]
        elc_raise_amount: u128,
        #[ink(topic)]
        elp_amount: u128,
    }

    #[ink(event)]
    pub struct ContractEvent {
        #[ink(topic)]
        elc_risk_reserve_source: u128,
        #[ink(topic)]
        elc_reserve_source: u128,
        #[ink(topic)]
        risk_reserve_consumed: u128,
        #[ink(topic)]
        reserve_consumed: u128,
    }

    impl Stable {
        #[ink(constructor)]
        pub fn new (
            elc_token: AccountId,
            relp_token: AccountId,
            govern_addr: AccountId,
            oracle_addr: AccountId,
            additional_addr: AccountId,
            exchange_addr: AccountId,
        ) -> Self {
            let elc_contract: ELCRef = FromAccountId::from_account_id(elc_token);
            let relp_contract: RELPRef = FromAccountId::from_account_id(relp_token);
            let govern_contract: GovernRef = FromAccountId::from_account_id(govern_addr);
            let oracle_contract: OracleRef = FromAccountId::from_account_id(oracle_addr);
            let add_contract: AdditionalRef = FromAccountId::from_account_id(additional_addr);
            let exchange_contract: PatraExchange2Ref = FromAccountId::from_account_id(exchange_addr);
            let blocktime = Self::env().block_timestamp().into();
            let instance = Self {
                reserve: 0,
                risk_reserve: 0,
                elc_risk_reserve_source: 0,
                elc_reserve_source: 0,
                last_expand_time:  blocktime,
                last_contract_time:  blocktime,
                adjust_gap: 3600 * 24 * 1000, // one hour
                elc_contract: Lazy::new(elc_contract),
                relp_contract: Lazy::new(relp_contract),
                govern_contract: Lazy::new(govern_contract),
                oracle_contract: Lazy::new(oracle_contract),
                add_contract: Lazy::new(add_contract),
                exchange_contract: Lazy::new(exchange_contract),
                exchange_accountid: exchange_addr,
            };
            instance
        }

        /// add liquidity for ELP，returns rELP and ELC
        #[ink(message, payable)]
        pub fn add_liquidity(&mut self) -> (Balance, Balance) {
            let caller: AccountId = self.env().caller();
            let elp_amount: Balance = self.env().transferred_balance();
            let (relp_tokens, elc_tokens) = self.compute_liquidity(elp_amount);
            if elc_tokens > 0 {
                assert!(self
                    .elc_contract
                    .mint(caller, elc_tokens)
                    .is_ok());
            }
            assert!(self
                .relp_contract
                .mint(caller, relp_tokens)
                .is_ok());
            ::ink_lang::codegen::EmitEvent::<Stable>::emit_event(Self::env(), AddLiquidity {
            // self.env().emit_event(AddLiquidity {
                sender: caller,
                elp_amount: elp_amount,
                relp_amount: relp_tokens,
                elc_amount: elc_tokens,
            });
            self.reserve += elp_amount;
            (relp_tokens, elc_tokens)
        }

        /// compute add-liquidity threshold for internal and external call
        #[ink(message)]
        pub fn compute_liquidity(&self, elp_amount_deposit: Balance) -> (Balance, Balance) {
            let elc_price: u128 = self.oracle_contract.elc_price();
            assert!(elc_price > 0, "ELC price is zero, check oracle functionality first!");
            let elp_price: u128 = self.oracle_contract.elp_price();
            assert!(elp_price > 0, "ELP price is zero, check oracle functionality first!");

            let mut relp_price = self.relp_price();
            let lr = self.liability_ratio();
            if lr < 30 {
                let relp_tokens = elp_price * elp_amount_deposit * (100 - lr) / relp_price / 100;
                let elc_tokens = elp_price * elp_amount_deposit * lr / elc_price / 100;
                (relp_tokens, elc_tokens)
            } else {
                let relp_tokens = elp_price * elp_amount_deposit / relp_price;
                (relp_tokens, 0)
            }
        }

        /// remove liquidity, user can redeem their ELP by burn rELP and ELC.
        /// elc amount will be calculated automatically by `relp_amount`.
        #[ink(message)]
        pub fn remove_liquidity(&mut self, relp_amount: Balance) -> Balance {
            let lr = self.liability_ratio();
            assert!(lr > 90, "LR must be less than 90%");

            let elc_price: u128 = self.oracle_contract.elc_price();
            assert!(elc_price > 0, "ELC price is zero, check oracle functionality first!");
            let elp_price: u128 = self.oracle_contract.elp_price();
            assert!(elp_price > 0, "ELP price is zero, check oracle functionality first!");

            let caller = self.env().caller();
            let relp_price = self.relp_price();
            let elc_need = relp_amount * relp_price * lr / elc_price / (100 - lr);
            assert!(self.elc_contract.burn(caller, elc_need).is_ok());
            assert!(self.relp_contract.burn(caller, relp_amount).is_ok());
            
            //redeem ELP
            let elp_amount = relp_amount * relp_price / elp_price / (100 - lr) / 100;
            let caller: AccountId= self.env().caller();
            assert!(self.env().transfer(caller, elp_amount).is_ok());
            self.reserve -= elp_amount;
            ::ink_lang::codegen::EmitEvent::<Stable>::emit_event(Self::env(), RemoveLiquidity {
            // self.env().emit_event(RemoveLiquidity {
                sender: caller,
                relp_amount: relp_amount,
                elc_amount: elc_need,
                elp_amount: elp_amount,
            });
            elp_amount
        }

        /// when price higher:
        /// 1.call swap contract, swap elc for elp
        /// 2.raise ELC
        #[ink(message)]
        pub fn expand_elc(&mut self) {
            let lr = self.liability_ratio();
            assert!(lr < 70, "LR must be less than 70%");

            let elc_price: u128 = self.oracle_contract.elc_price();
            assert!(elc_price > 0, "ELC price is zero, check oracle functionality first!");
            let elp_price: u128 = self.oracle_contract.elp_price();
            assert!(elp_price > 0, "ELP price is zero, check oracle functionality first!");
            let elcaim_deviation = self.govern_contract.elcaim(); //theory deviation is [elcaim * 98, elcaim]
            assert!(elc_price > elcaim_deviation, "ELC price must higher than ELCaim");

            // assert time > adjust duration
            let block_time:u128 = self.env().block_timestamp().into();
            let gap: u128 = block_time - self.last_expand_time;
            assert!(gap >= self.adjust_gap, "Time between two elc expand need to longer than 24 hours");

            let base: u128 = 10;
            let decimals: u32 = self.elc_contract.token_decimals().unwrap_or(0).into();
            // estimate ELC value: value per ELC in swap
            let elp_amount_per_elc = self.exchange_contract.get_token_to_dot_input_price(base.pow(decimals.into()));
            // TODO: 此处是否还需要乘以elp_price.
            let value_per_elc = elp_amount_per_elc * elp_price;

            // delta_elp = 0.1% * elp / (1- 0.1%) = elp / 999
            // TODO: exchange_contrat does not have method `reserve_elp`.
            // let delta_elp = self.exchange_contract.reserve_elp().saturating_mul(base.pow(decimals)) / 999;
            let delta_elp = 100000000u128;  // TODO: just for pass compile, delete this line when finish the line above.
            let delta_elc = delta_elp / value_per_elc;

            let elc_risk = self.elc_risk_reserve_source;
            let elc_reserve = self.elc_reserve_source;
            let elc_reserve_all = elc_risk + elc_reserve;
            
            if (elc_reserve_all) >= delta_elc {
                // 计算出兑换的elp量
                let elp_amount = self.exchange_contract.swap_token_to_dot_input(delta_elc);
                // ELC兑换ELP
                self.swap_elp_with_elc(delta_elc, elc_reserve, elc_risk, elp_amount); 
            } else {
                // 先将所有的elc reserve and elc risk交换成elp
                let elp_amount = self.exchange_contract.swap_token_to_dot_input(elc_reserve_all);
                self.swap_elp_with_elc(elc_reserve_all, elc_reserve, elc_risk, elp_amount); 

                // ELC增发，当elc_reserve_all用完后，可适量进行ELC增发
                let elc_balance: u128 = self.elc_contract.total_supply();
                // 理论增发量
                let mut issue = (elc_price - elcaim_deviation) * elc_balance / elcaim_deviation;

                // 将所有储备ELC和风险准备ELC均换成ELP后，剩下还需要兑换的量
                // 根据需求: 理论增发量的5% == delta_elc - elc_reserve_all, 即剩余增发量=(result of sub) * 20.
                let remain_elc = (delta_elc- elc_reserve_all) * 20;

                let now_time = self.env().block_timestamp().into();
                // elc reserve is zero, do elc additional issue work.
                if elc_reserve_all == 0 {
                    // reward to relp holders.
                    // TODO: use `let PART95 ＝ AMOUNT * 95 %` and `AMOUNT - PART95`
                    let (reward_elc, swap_elc) = (issue * 95 / 100, issue * 5 / 100);

                    let total_coinday = self.update_total_coinday(now_time);
                    // assert!(self.add_contract.update_awards(award_info).is_ok());
                    // TODO: 95％的增发量，使用elc.mint(relp_contract_addr, amount)铸elc给relp合约地址，当各用户根据
                    // relp token持有币天来清算elc时，直接在relp合约中transfer即可, 这样似乎用不着additional合约了
                    assert!(self.add_contract.update_awards(reward_elc, total_coinday, now_time).is_ok());

                    // ELC swap to ELP
                    let elp_amount = self.exchange_contract.swap_token_to_dot_input(swap_elc);
                    self.swap_elp_with_elc(swap_elc, 0, 0, elp_amount);
                } else {
                    if issue > remain_elc {
                        issue = remain_elc;
                    }
                    // reward to relp holders.
                    let (reward_elc, swap_elc) = (issue * 95 / 100, issue * 5 / 100);

                    let total_coinday = self.update_total_coinday(now_time);
                    // assert!(self.add_contract.update_awards(award_info).is_ok());
                    assert!(self.add_contract.update_awards(reward_elc, total_coinday, now_time).is_ok());

                    // ELC swap to ELP
                    let elp_amount = self.exchange_contract.swap_token_to_dot_input(swap_elc);
                    self.swap_elp_with_elc(swap_elc, 0, 0, elp_amount);
                }
            }
            self.last_expand_time = block_time;
        }

        // when price lower, call swap contract, swap elp for elc
        #[ink(message, payable)]
        pub fn contract_elc(&mut self){
            let elc_price: u128 = self.oracle_contract.elc_price();
            assert!(elc_price > 0, "ELC price is zero, check oracle functionality first!");
            let elp_price: u128 = self.oracle_contract.elp_price();
            assert!(elp_price > 0, "ELP price is zero, check oracle functionality first!");
            let elcaim_deviation = self.govern_contract.elcaim(); //theory deviation is [elcaim * 98, elcaim]
            assert!(elc_price < elcaim_deviation * 98 / 100, "ELC price must lower than ELCaim * 98%");

            // assert time > adjust duration
            let block_time:u128 = self.env().block_timestamp().into();
            let gap: u128 = block_time - self.last_expand_time;
            assert!(gap >= self.adjust_gap, "Time between two elc contract need to longer than 24 hours");

            let base: u128 = 10;
            // estimate ELC value: value per ELC in swap
            let decimals: u32 = self.elc_contract.token_decimals().unwrap_or(0).into();
            // estimate ELC value: value per ELC in swap
            let elc_amount_per_elp = self.exchange_contract.get_dot_to_token_input_price(base.pow(decimals.into()));
            let value_per_elp = elc_amount_per_elp * elc_price;

            // 计算兑换量
            // 将价格冲击放大10000倍，用于防止计算出现小数
            // TODO: exchange_contract 没有reserve_elc()这个方法
            // let delta_price_impact = (elcaim_deviation * 98 / 100 - elc_price) * 10000 / elc_price;
            // let delta_elc = self.exchange_contract.reserve_elc().saturating_mul(base.pow(decimals)) / (10000 - delta_price_impact) / delta_price_impact;
            let delta_elc = 100000000u128;  // TODO: just for pass compile, delete this line when finish the two line above.
            let mut delta_elp = delta_elc / value_per_elp;

            let mut elp_risk = self.risk_reserve;
            let elp_reserve = self.reserve;

            if elp_risk > 0 {
                if delta_elp > elp_risk {
                    delta_elp = elp_risk;
                } 
                assert!(self.env().transfer(self.exchange_accountid, delta_elp).is_ok());
                let elc_amount = self.exchange_contract.swap_dot_to_token_input();
                self.swap_elc_with_elp(delta_elp, 0, elc_amount);
            } else {
                if delta_elp > elp_reserve * 2 / 100 {
                    delta_elp = elp_reserve * 2 / 100;
                }
                assert!(self.env().transfer(self.exchange_accountid, delta_elp).is_ok());
                let elc_amount = self.exchange_contract.swap_dot_to_token_input();
                self.swap_elc_with_elp(0, delta_elp, elc_amount);
            }
            self.last_contract_time = block_time;
        }

        /// compute liability ratio
        #[ink(message)]
        pub fn liability_ratio(&self) -> u128 {
            let elp_price: u128 = self.oracle_contract.elp_price();
            assert!(elp_price > 0, "ELP price is zero, check oracle functionality first!");
            let elc_price: u128 = self.oracle_contract.elc_price();
            assert!(elc_price > 0, "ELC price is zero, check oracle functionality first!");
            let elp_amount: u128 = self.reserve;
            let elc_amount: Balance = self.elc_contract.total_supply();
            let lr =  elc_amount * elc_price * 100 /(elp_price * elp_amount); //100 as base
            if lr > 100 {
                return 100
            } else if lr < 1 {
                return 1
            }
            lr 
        }

        ///compute internal relp price for query
        #[ink(message)]
        pub fn relp_price(&self) -> u128 {
            let elc_price: u128 = self.oracle_contract.elc_price();
            assert!(elc_price > 0, "ELC price is zero, check oracle functionality first!");
            let elp_price: u128 = self.oracle_contract.elp_price();
            assert!(elp_price > 0, "ELP price is zero, check oracle functionality first!");
            let elc_supply: Balance = self.elc_contract.total_supply();
            let relp_supply = self.relp_contract.total_supply();
            if relp_supply > 0 {
                //p(rELP) = (p(ELP)*Amount(ELP) - p(ELC)*Totalsupply(ELC)) / Amount(rELP)
               let relp_price = (elp_price * self.reserve - elc_price * elc_supply) / relp_supply;
               relp_price
            } else {
                // initial
                elp_price
            }
        }

        /// Do not direct tranfer ELP to deployed pool address, use this function
        #[ink(message, payable)]
        pub fn add_risk_reserve(&mut self) {
            let elp_amount: Balance = self.env().transferred_balance();
            self.risk_reserve += elp_amount;
        }

        #[ink(message)]
        pub fn elp_reserve(&self) -> u128 { self.reserve }

        #[ink(message)]
        pub fn elp_risk_reserve(&self) -> u128 { self.risk_reserve }

        #[ink(message)]
        pub fn elc_reserve(&self) -> u128 { self.elc_reserve_source }

        #[ink(message)]
        pub fn elc_risk_reserve(&self) -> u128 { self.elc_risk_reserve_source }

        fn swap_elp_with_elc(
            &mut self, 
            elc_amount: u128, 
            elc_reserve: u128, 
            elc_risk: u128,
            elp_amount: u128) {
            // 初始化为0
            let (mut elc_event_reserve, mut elc_event_risk, mut elc_event_amount) = (0, 0, 0);

            if elc_reserve >= elc_amount {
                elc_event_reserve = elc_amount;
                self.elc_reserve_source -= elc_event_reserve;
                self.reserve += elp_amount;
            } else {
                // update elc reserve and elc risk reserve
                if elc_risk > 0 || elc_reserve > 0 {
                    elc_event_reserve = elc_reserve;
                    elc_event_risk = elc_amount - elc_reserve;
                    self.elc_reserve_source -= elc_event_reserve;
                    self.elc_risk_reserve_source -= elc_event_risk;
                } else {
                    elc_event_amount = elc_amount;
                }
                
                // update elp reserve and elc risk reserve
                let delta_reserve_elp = elc_reserve * elp_amount / elc_amount;
                self.reserve += delta_reserve_elp;
                self.risk_reserve += elp_amount - delta_reserve_elp;
            }

            ::ink_lang::codegen::EmitEvent::<Stable>::emit_event(Self::env(), ExpandEvent {
            // self.env().emit_event(ExpandEvent {
                elc_reserve_amount: elc_event_reserve,
                elc_risk_amount: elc_event_risk,
                elc_raise_amount: elc_event_amount,
                elp_amount: elp_amount,
            });
        }

        fn swap_elc_with_elp(&mut self, elp_risk: u128, elp_reserve: u128, elc_amount: u128) {
            if elp_reserve > 0{
                self.elc_reserve_source += elc_amount;
                self.reserve -= elp_reserve;
                ::ink_lang::codegen::EmitEvent::<Stable>::emit_event(Self::env(), ContractEvent {
                // self.env().emit_event(ContractEvent {
                    elc_risk_reserve_source: 0,
                    elc_reserve_source: elc_amount,
                    risk_reserve_consumed: 0,
                    reserve_consumed: elp_reserve,
                });
            } else {
                self.elc_risk_reserve_source += elc_amount;
                self.risk_reserve -= elp_risk;
                ::ink_lang::codegen::EmitEvent::<Stable>::emit_event(Self::env(), ContractEvent {
                // self.env().emit_event(ContractEvent {
                    elc_risk_reserve_source: elc_amount,
                    elc_reserve_source: 0,
                    risk_reserve_consumed: elp_risk,
                    reserve_consumed: 0,
                });
            }
        }

        // TODO: 此处扩大了1e12次方，以防止浮点数出现，后续需要除去1e12
        // 考虑将(elc_amount, cur_total_coinday, timestamp)三元素元组替换(per_coinday, timestamp)
        // 将除法运算置后到最终结果
        /*
        fn update_total_coinday(&mut self, elc_amount: u128, now_time: u128) -> (u128, u128) {
            let (cur_total_coinday, last_time) = self.add_contract.total_coinday();
            let total_supply = self.relp_contract.total_supply();
            let increase_coinday = total_supply * (now_time - last_time);
            let new_total_coinday = cur_total_coinday + increase_coinday;
            // update total coinday
            assert!(self.add_contract.update_total_coinday((new_total_coinday, now_time)).is_ok());
            let per_coinday = elc_amount * 1e12 as u128 / new_total_coinday;
            (per_coinday, now_time)
        }
        */
        // 使用三元组见上述描述, 只需要返回新的总币天
        fn update_total_coinday(&mut self, now_time: u128) -> u128 {
            let (cur_total_coinday, last_time) = self.add_contract.total_coinday();
            let total_supply = self.relp_contract.total_supply();
            let increase_coinday = total_supply * (now_time - last_time);
            let new_total_coinday = cur_total_coinday + increase_coinday;
            // update total coinday
            assert!(self.add_contract.update_total_coinday((new_total_coinday, now_time)).is_ok());
            new_total_coinday
        }
    }

    /// Unit tests
    #[cfg(test)]
    mod tests {
        /// Imports all the definitions from outer scope so we can use them here.
        use super::*;
        use ink_lang as ink;

        #[ink::test]
        fn new_works() {
            let stable = Stable::new(
                AccountId::from([0x1; 32]),
                AccountId::from([0x2; 32]),
                AccountId::from([0x3; 32]),
                AccountId::from([0x4; 32]),
                AccountId::from([0x5; 32]),
                AccountId::from([0x6; 32]),
            );
            assert_eq!(stable.elp_reserve(), 0);
            assert_eq!(stable.elp_risk_reserve(), 0);
            assert_eq!(stable.elc_reserve(), 0);
            assert_eq!(stable.elc_risk_reserve(), 0);
            assert_eq!(stable.adjust_gap, 3600*24*1000);
        }
    }
}
