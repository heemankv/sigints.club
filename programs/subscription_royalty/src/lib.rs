use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, MintTo, SetAuthority, Token};
use anchor_spl::token::spl_token::state::Mint as SplMint;
use anchor_spl::token::spl_token::instruction::AuthorityType;

declare_id!("BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE");

const PERSONA_REGISTRY_ID: Pubkey = pubkey!("5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi");

#[program]
pub mod subscription_royalty {
    use super::*;

    pub fn subscribe(
        ctx: Context<Subscribe>,
        tier_id: [u8; 32],
        pricing_type: u8,
        evidence_level: u8,
        expires_at: i64,
        quota_remaining: u32,
    ) -> Result<()> {
        let persona_config = validate_persona(&ctx.accounts.persona)?;
        require!(
            persona_config.status == PersonaStatus::Active as u8,
            ErrorCode::PersonaInactive
        );

        let sub = &mut ctx.accounts.subscription;
        sub.subscriber = ctx.accounts.subscriber.key();
        sub.persona = ctx.accounts.persona.key();
        sub.tier_id = tier_id;
        sub.pricing_type = pricing_type;
        sub.evidence_level = evidence_level;
        sub.expires_at = expires_at;
        sub.quota_remaining = quota_remaining;
        sub.status = SubscriptionStatus::Active as u8;
        sub.nft_mint = ctx.accounts.subscription_mint.key();
        sub.bump = ctx.bumps.subscription;

        let persona_state = &mut ctx.accounts.persona_state;
        if persona_state.persona == Pubkey::default() {
            persona_state.persona = ctx.accounts.persona.key();
            persona_state.subscription_count = 0;
            persona_state.bump = ctx.bumps.persona_state;
        }
        persona_state.subscription_count = persona_state.subscription_count.saturating_add(1);

        let persona_key = ctx.accounts.persona.key();
        let subscriber_key = ctx.accounts.subscriber.key();
        let expected_ata =
            get_associated_token_address(&subscriber_key, &ctx.accounts.subscription_mint.key());
        require_keys_eq!(
            expected_ata,
            ctx.accounts.subscriber_ata.key(),
            ErrorCode::InvalidSubscriberAta
        );

        if ctx.accounts.subscription_mint.data_is_empty() {
            let rent = Rent::get()?;
            let mint_lamports = rent.minimum_balance(SplMint::LEN);
            let create_ix = system_instruction::create_account(
                &ctx.accounts.subscriber.key(),
                &ctx.accounts.subscription_mint.key(),
                mint_lamports,
                SplMint::LEN as u64,
                &ctx.accounts.token_program.key(),
            );
            let mint_seeds: &[&[u8]] = &[
                b"subscription_mint",
                persona_key.as_ref(),
                subscriber_key.as_ref(),
                &[ctx.bumps.subscription_mint],
            ];
            invoke_signed(
                &create_ix,
                &[
                    ctx.accounts.subscriber.to_account_info(),
                    ctx.accounts.subscription_mint.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[mint_seeds],
            )?;

            token::initialize_mint(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    token::InitializeMint {
                        mint: ctx.accounts.subscription_mint.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                    },
                ),
                0,
                &ctx.accounts.subscription.key(),
                Some(&ctx.accounts.subscription.key()),
            )?;
        }

        if ctx.accounts.subscriber_ata.data_is_empty() {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.associated_token_program.to_account_info(),
                anchor_spl::associated_token::Create {
                    payer: ctx.accounts.subscriber.to_account_info(),
                    associated_token: ctx.accounts.subscriber_ata.to_account_info(),
                    authority: ctx.accounts.subscriber.to_account_info(),
                    mint: ctx.accounts.subscription_mint.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
            );
            anchor_spl::associated_token::create(cpi_ctx)?;
        }

        let signer_seeds: &[&[u8]] = &[
            b"subscription",
            persona_key.as_ref(),
            subscriber_key.as_ref(),
            &[ctx.bumps.subscription],
        ];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.subscription_mint.to_account_info(),
                    to: ctx.accounts.subscriber_ata.to_account_info(),
                    authority: ctx.accounts.subscription.to_account_info(),
                },
                &[signer_seeds],
            ),
            1,
        )?;

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.subscription.to_account_info(),
                    account_or_mint: ctx.accounts.subscription_mint.to_account_info(),
                },
                &[signer_seeds],
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.subscription.to_account_info(),
                    account_or_mint: ctx.accounts.subscription_mint.to_account_info(),
                },
                &[signer_seeds],
            ),
            AuthorityType::FreezeAccount,
            None,
        )?;
        Ok(())
    }

    pub fn renew(ctx: Context<Renew>, expires_at: i64, quota_remaining: u32) -> Result<()> {
        let sub = &mut ctx.accounts.subscription;
        sub.expires_at = expires_at;
        sub.quota_remaining = quota_remaining;
        if sub.status != SubscriptionStatus::Active as u8 {
            sub.status = SubscriptionStatus::Active as u8;
            ctx.accounts.persona_state.subscription_count =
                ctx.accounts.persona_state.subscription_count.saturating_add(1);
        }
        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let sub = &mut ctx.accounts.subscription;
        if sub.status == SubscriptionStatus::Active as u8 {
            sub.status = SubscriptionStatus::Canceled as u8;
            ctx.accounts.persona_state.subscription_count =
                ctx.accounts.persona_state.subscription_count.saturating_sub(1);
        } else {
            sub.status = SubscriptionStatus::Canceled as u8;
        }
        Ok(())
    }

    pub fn record_signal(
        ctx: Context<RecordSignal>,
        signal_hash: [u8; 32],
        signal_pointer_hash: [u8; 32],
        keybox_hash: [u8; 32],
        keybox_pointer_hash: [u8; 32],
    ) -> Result<()> {
        let persona_config = validate_persona(&ctx.accounts.persona)?;
        require!(
            persona_config.status == PersonaStatus::Active as u8,
            ErrorCode::PersonaInactive
        );
        require_keys_eq!(
            persona_config.authority,
            ctx.accounts.authority.key(),
            ErrorCode::UnauthorizedPersona
        );
        require!(
            ctx.accounts.persona_state.subscription_count > 0,
            ErrorCode::NoSubscribers
        );

        let signal = &mut ctx.accounts.signal;
        signal.persona = ctx.accounts.persona.key();
        signal.signal_hash = signal_hash;
        signal.signal_pointer_hash = signal_pointer_hash;
        signal.keybox_hash = keybox_hash;
        signal.keybox_pointer_hash = keybox_pointer_hash;
        let clock = Clock::get()?;
        signal.created_at = clock.unix_timestamp.saturating_mul(1_000);
        signal.bump = ctx.bumps.signal;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(
        init,
        payer = subscriber,
        space = Subscription::SPACE,
        seeds = [b"subscription", persona.key().as_ref(), subscriber.key().as_ref()],
        bump
    )]
    pub subscription: Box<Account<'info, Subscription>>,
    #[account(
        mut,
        seeds = [b"subscription_mint", persona.key().as_ref(), subscriber.key().as_ref()],
        bump
    )]
    /// CHECK: PDA mint is created and validated in handler.
    pub subscription_mint: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = subscriber,
        space = PersonaState::SPACE,
        seeds = [b"persona_state", persona.key().as_ref()],
        bump
    )]
    pub persona_state: Box<Account<'info, PersonaState>>,
    #[account(mut)]
    /// CHECK: ATA address is validated in handler.
    pub subscriber_ata: AccountInfo<'info>,
    /// CHECK: persona is validated against registry in handler
    pub persona: AccountInfo<'info>,
    #[account(mut)]
    pub subscriber: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Renew<'info> {
    #[account(mut, has_one = subscriber)]
    pub subscription: Account<'info, Subscription>,
    #[account(
        mut,
        seeds = [b"persona_state", subscription.persona.as_ref()],
        bump = persona_state.bump
    )]
    pub persona_state: Account<'info, PersonaState>,
    pub subscriber: Signer<'info>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut, has_one = subscriber)]
    pub subscription: Account<'info, Subscription>,
    #[account(
        mut,
        seeds = [b"persona_state", subscription.persona.as_ref()],
        bump = persona_state.bump
    )]
    pub persona_state: Account<'info, PersonaState>,
    pub subscriber: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(signal_hash: [u8; 32])]
pub struct RecordSignal<'info> {
    #[account(
        init,
        payer = authority,
        space = SignalRecord::SPACE,
        seeds = [b"signal", persona.key().as_ref(), &signal_hash],
        bump
    )]
    pub signal: Account<'info, SignalRecord>,
    /// CHECK: validated in handler against persona registry
    pub persona: AccountInfo<'info>,
    #[account(
        seeds = [b"persona_state", persona.key().as_ref()],
        bump = persona_state.bump
    )]
    pub persona_state: Account<'info, PersonaState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Subscription {
    pub subscriber: Pubkey,
    pub persona: Pubkey,
    pub tier_id: [u8; 32],
    pub pricing_type: u8,
    pub evidence_level: u8,
    pub expires_at: i64,
    pub quota_remaining: u32,
    pub status: u8,
    pub nft_mint: Pubkey,
    pub bump: u8,
}

impl Subscription {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 1 + 8 + 4 + 1 + 32 + 1;
}

#[account]
pub struct SignalRecord {
    pub persona: Pubkey,
    pub signal_hash: [u8; 32],
    pub signal_pointer_hash: [u8; 32],
    pub keybox_hash: [u8; 32],
    pub keybox_pointer_hash: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}

impl SignalRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct PersonaState {
    pub persona: Pubkey,
    pub subscription_count: u64,
    pub bump: u8,
}

impl PersonaState {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

pub enum PricingType {
    SubscriptionLimited = 0,
    SubscriptionUnlimited = 1,
    PerSignal = 2,
}

pub enum EvidenceLevel {
    Trust = 0,
    Verifier = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PersonaConfig {
    pub persona_id: [u8; 32],
    pub authority: Pubkey,
    pub dao: Pubkey,
    pub tiers_hash: [u8; 32],
    pub status: u8,
    pub bump: u8,
}

pub enum PersonaStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Persona account is invalid or not registered")]
    InvalidPersona,
    #[msg("Persona is not active")]
    PersonaInactive,
    #[msg("Signer is not the persona authority")]
    UnauthorizedPersona,
    #[msg("No subscribers exist for this persona")]
    NoSubscribers,
    #[msg("Subscriber ATA does not match expected address")]
    InvalidSubscriberAta,
}

fn load_persona_config(account: &AccountInfo) -> Result<PersonaConfig> {
    require_keys_eq!(*account.owner, PERSONA_REGISTRY_ID, ErrorCode::InvalidPersona);
    let mut data: &[u8] = &account.data.borrow();
    let cfg = PersonaConfig::deserialize(&mut data)
        .map_err(|_| error!(ErrorCode::InvalidPersona))?;
    Ok(cfg)
}

fn validate_persona(account: &AccountInfo) -> Result<PersonaConfig> {
    let cfg = load_persona_config(account)?;
    let expected = Pubkey::find_program_address(
        &[b"persona", cfg.persona_id.as_ref()],
        &PERSONA_REGISTRY_ID,
    )
    .0;
    require_keys_eq!(expected, *account.key, ErrorCode::InvalidPersona);
    Ok(cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subscription_space_constant() {
        assert_eq!(Subscription::SPACE, 152);
    }

    #[test]
    fn signal_record_space_constant() {
        assert_eq!(SignalRecord::SPACE, 177);
    }

    #[test]
    fn persona_state_space_constant() {
        assert_eq!(PersonaState::SPACE, 49);
    }

    #[test]
    fn pricing_enum_values() {
        assert_eq!(PricingType::SubscriptionLimited as u8, 0);
        assert_eq!(PricingType::SubscriptionUnlimited as u8, 1);
        assert_eq!(PricingType::PerSignal as u8, 2);
    }
}

pub enum SubscriptionStatus {
    Active = 0,
    Canceled = 1,
    Expired = 2,
}
