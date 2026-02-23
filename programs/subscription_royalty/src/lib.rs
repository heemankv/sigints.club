use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{self, MintTo, SetAuthority, Token2022};
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::instruction::AuthorityType;
use spl_token_2022::state::Mint as Mint2022;

declare_id!("BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE");
const PLATFORM_FEE_BPS: u64 = 100;

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
        price_lamports: u64,
    ) -> Result<()> {
        let stream_config = validate_stream(&ctx.accounts.stream, &ctx.accounts.stream_registry_program)?;
        require!(
            stream_config.status == StreamStatus::Active as u8,
            ErrorCode::StreamInactive
        );
        if stream_config.visibility == StreamVisibility::Private as u8 {
            require_wallet_key(
                &ctx.accounts.wallet_key,
                &ctx.accounts.subscriber,
                &ctx.program_id,
            )?;
        }
        let tier_config = validate_tier(
            &ctx.accounts.tier_config,
            &ctx.accounts.stream,
            &tier_id,
            &ctx.accounts.stream_registry_program,
        )?;
        require!(
            tier_config.status == TierStatus::Active as u8,
            ErrorCode::TierInactive
        );
        require!(
            tier_config.price_lamports == price_lamports,
            ErrorCode::PriceMismatch
        );
        require!(
            tier_config.pricing_type == pricing_type,
            ErrorCode::TierMismatch
        );
        require!(
            tier_config.evidence_level == evidence_level,
            ErrorCode::TierMismatch
        );
        require!(tier_config.quota == quota_remaining, ErrorCode::TierMismatch);
        require!(
            tier_config.pricing_type == PricingType::SubscriptionUnlimited as u8,
            ErrorCode::TierMismatch
        );
        require_keys_eq!(
            stream_config.authority,
            ctx.accounts.maker.key(),
            ErrorCode::UnauthorizedStream
        );
        require_keys_eq!(
            stream_config.dao,
            ctx.accounts.treasury.key(),
            ErrorCode::InvalidTreasury
        );

        let sub = &mut ctx.accounts.subscription;
        sub.subscriber = ctx.accounts.subscriber.key();
        sub.stream = ctx.accounts.stream.key();
        sub.tier_id = tier_id;
        sub.pricing_type = pricing_type;
        sub.evidence_level = evidence_level;
        sub.expires_at = expires_at;
        sub.quota_remaining = quota_remaining;
        sub.status = SubscriptionStatus::Active as u8;
        sub.nft_mint = ctx.accounts.subscription_mint.key();
        sub.bump = ctx.bumps.subscription;

        if price_lamports > 0 {
            let fee = price_lamports.saturating_mul(PLATFORM_FEE_BPS) / 10_000;
            let maker_amount = price_lamports.saturating_sub(fee);
            if maker_amount > 0 {
                let ix = system_instruction::transfer(
                    &ctx.accounts.subscriber.key(),
                    &ctx.accounts.maker.key(),
                    maker_amount,
                );
                anchor_lang::solana_program::program::invoke(
                    &ix,
                    &[
                        ctx.accounts.subscriber.to_account_info(),
                        ctx.accounts.maker.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                    ],
                )?;
            }
            if fee > 0 {
                let ix = system_instruction::transfer(
                    &ctx.accounts.subscriber.key(),
                    &ctx.accounts.treasury.key(),
                    fee,
                );
                anchor_lang::solana_program::program::invoke(
                    &ix,
                    &[
                        ctx.accounts.subscriber.to_account_info(),
                        ctx.accounts.treasury.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                    ],
                )?;
            }
        }

        let stream_state = &mut ctx.accounts.stream_state;
        if stream_state.stream == Pubkey::default() {
            stream_state.stream = ctx.accounts.stream.key();
            stream_state.subscription_count = 0;
            stream_state.bump = ctx.bumps.stream_state;
        }
        stream_state.subscription_count = stream_state.subscription_count.saturating_add(1);

        let stream_key = ctx.accounts.stream.key();
        let subscriber_key = ctx.accounts.subscriber.key();
        let expected_ata = get_associated_token_address_with_program_id(
            &subscriber_key,
            &ctx.accounts.subscription_mint.key(),
            &ctx.accounts.token_2022_program.key(),
        );
        require_keys_eq!(
            expected_ata,
            ctx.accounts.subscriber_ata.key(),
            ErrorCode::InvalidSubscriberAta
        );

        if ctx.accounts.subscription_mint.data_is_empty() {
            let rent = Rent::get()?;
            let mint_len = ExtensionType::try_calculate_account_len::<Mint2022>(&[
                ExtensionType::NonTransferable,
            ])?;
            let mint_lamports = rent.minimum_balance(mint_len);
            let create_ix = system_instruction::create_account(
                &ctx.accounts.subscriber.key(),
                &ctx.accounts.subscription_mint.key(),
                mint_lamports,
                mint_len as u64,
                &ctx.accounts.token_2022_program.key(),
            );
            let mint_seeds: &[&[u8]] = &[
                b"subscription_mint",
                stream_key.as_ref(),
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

            let init_nt_ix = spl_token_2022::instruction::initialize_non_transferable_mint(
                &ctx.accounts.token_2022_program.key(),
                &ctx.accounts.subscription_mint.key(),
            )?;
            invoke_signed(
                &init_nt_ix,
                &[ctx.accounts.subscription_mint.to_account_info()],
                &[mint_seeds],
            )?;

            token_2022::initialize_mint(
                CpiContext::new(
                    ctx.accounts.token_2022_program.to_account_info(),
                    token_2022::InitializeMint {
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
                    token_program: ctx.accounts.token_2022_program.to_account_info(),
                },
            );
            anchor_spl::associated_token::create(cpi_ctx)?;
        }

        let signer_seeds: &[&[u8]] = &[
            b"subscription",
            stream_key.as_ref(),
            subscriber_key.as_ref(),
            &[ctx.bumps.subscription],
        ];

        token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_2022_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.subscription_mint.to_account_info(),
                    to: ctx.accounts.subscriber_ata.to_account_info(),
                    authority: ctx.accounts.subscription.to_account_info(),
                },
                &[signer_seeds],
            ),
            1,
        )?;

        token_2022::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_2022_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.subscription.to_account_info(),
                    account_or_mint: ctx.accounts.subscription_mint.to_account_info(),
                },
                &[signer_seeds],
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        token_2022::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_2022_program.to_account_info(),
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
            ctx.accounts.stream_state.subscription_count =
                ctx.accounts.stream_state.subscription_count.saturating_add(1);
        }
        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let sub = &mut ctx.accounts.subscription;
        if sub.status == SubscriptionStatus::Active as u8 {
            sub.status = SubscriptionStatus::Canceled as u8;
            ctx.accounts.stream_state.subscription_count =
                ctx.accounts.stream_state.subscription_count.saturating_sub(1);
        } else {
            sub.status = SubscriptionStatus::Canceled as u8;
        }
        Ok(())
    }

    pub fn register_key(ctx: Context<RegisterKey>, enc_pubkey: [u8; 32]) -> Result<()> {
        let sub = &ctx.accounts.subscription;
        require!(
            sub.status == SubscriptionStatus::Active as u8,
            ErrorCode::SubscriptionInactive
        );
        let key = &mut ctx.accounts.subscriber_key;
        key.subscription = sub.key();
        key.stream = sub.stream;
        key.subscriber = sub.subscriber;
        key.enc_pubkey = enc_pubkey;
        let clock = Clock::get()?;
        key.updated_at = clock.unix_timestamp.saturating_mul(1_000);
        key.bump = ctx.bumps.subscriber_key;
        Ok(())
    }

    pub fn register_wallet_key(
        ctx: Context<RegisterWalletKey>,
        enc_pubkey: [u8; 32],
    ) -> Result<()> {
        let key = &mut ctx.accounts.wallet_key;
        key.subscriber = ctx.accounts.subscriber.key();
        key.enc_pubkey = enc_pubkey;
        let clock = Clock::get()?;
        key.updated_at = clock.unix_timestamp.saturating_mul(1_000);
        key.bump = ctx.bumps.wallet_key;
        Ok(())
    }

    pub fn record_signal(
        ctx: Context<RecordSignal>,
        signal_hash: [u8; 32],
        signal_pointer_hash: [u8; 32],
        keybox_hash: [u8; 32],
        keybox_pointer_hash: [u8; 32],
    ) -> Result<()> {
        let stream_config = validate_stream(&ctx.accounts.stream, &ctx.accounts.stream_registry_program)?;
        require!(
            stream_config.status == StreamStatus::Active as u8,
            ErrorCode::StreamInactive
        );
        require_keys_eq!(
            stream_config.authority,
            ctx.accounts.authority.key(),
            ErrorCode::UnauthorizedStream
        );
        let stream_state = &mut ctx.accounts.stream_state;
        if stream_state.stream == Pubkey::default() {
            stream_state.stream = ctx.accounts.stream.key();
            stream_state.subscription_count = 0;
            stream_state.bump = ctx.bumps.stream_state;
        }

        let signal = &mut ctx.accounts.signal;
        signal.stream = ctx.accounts.stream.key();
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
        seeds = [b"subscription", stream.key().as_ref(), subscriber.key().as_ref()],
        bump
    )]
    pub subscription: Box<Account<'info, Subscription>>,
    #[account(
        mut,
        seeds = [b"subscription_mint", stream.key().as_ref(), subscriber.key().as_ref()],
        bump
    )]
    /// CHECK: PDA mint is created and validated in handler.
    pub subscription_mint: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = subscriber,
        space = StreamState::SPACE,
        seeds = [b"stream_state", stream.key().as_ref()],
        bump
    )]
    pub stream_state: Box<Account<'info, StreamState>>,
    #[account(mut)]
    /// CHECK: ATA address is validated in handler.
    pub subscriber_ata: AccountInfo<'info>,
    /// CHECK: stream is validated against registry in handler
    pub stream: AccountInfo<'info>,
    /// CHECK: tier config validated against registry in handler
    pub tier_config: AccountInfo<'info>,
    /// CHECK: executable stream registry program (validated in handler)
    #[account(executable)]
    pub stream_registry_program: AccountInfo<'info>,
    #[account(mut)]
    pub subscriber: Signer<'info>,
    #[account(mut)]
    pub maker: SystemAccount<'info>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    /// CHECK: validated in handler for private streams
    pub wallet_key: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Renew<'info> {
    #[account(mut, has_one = subscriber)]
    pub subscription: Account<'info, Subscription>,
    #[account(
        mut,
        seeds = [b"stream_state", subscription.stream.as_ref()],
        bump = stream_state.bump
    )]
    pub stream_state: Account<'info, StreamState>,
    pub subscriber: Signer<'info>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut, has_one = subscriber)]
    pub subscription: Account<'info, Subscription>,
    #[account(
        mut,
        seeds = [b"stream_state", subscription.stream.as_ref()],
        bump = stream_state.bump
    )]
    pub stream_state: Account<'info, StreamState>,
    pub subscriber: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterKey<'info> {
    #[account(mut, has_one = subscriber)]
    pub subscription: Account<'info, Subscription>,
    #[account(
        init_if_needed,
        payer = subscriber,
        space = SubscriberKey::SPACE,
        seeds = [b"subscriber_key", subscription.key().as_ref()],
        bump
    )]
    pub subscriber_key: Account<'info, SubscriberKey>,
    #[account(mut)]
    pub subscriber: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterWalletKey<'info> {
    #[account(
        init_if_needed,
        payer = subscriber,
        space = WalletKey::SPACE,
        seeds = [b"wallet_key", subscriber.key().as_ref()],
        bump
    )]
    pub wallet_key: Account<'info, WalletKey>,
    #[account(mut)]
    pub subscriber: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordSignal<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = SignalRecord::SPACE,
        seeds = [b"signal_latest", stream.key().as_ref()],
        bump
    )]
    pub signal: Account<'info, SignalRecord>,
    /// CHECK: validated in handler against stream registry
    pub stream: AccountInfo<'info>,
    /// CHECK: executable stream registry program (validated in handler)
    #[account(executable)]
    pub stream_registry_program: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = StreamState::SPACE,
        seeds = [b"stream_state", stream.key().as_ref()],
        bump
    )]
    pub stream_state: Account<'info, StreamState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Subscription {
    pub subscriber: Pubkey,
    pub stream: Pubkey,
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
pub struct SubscriberKey {
    pub subscription: Pubkey,
    pub stream: Pubkey,
    pub subscriber: Pubkey,
    pub enc_pubkey: [u8; 32],
    pub updated_at: i64,
    pub bump: u8,
}

impl SubscriberKey {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct WalletKey {
    pub subscriber: Pubkey,
    pub enc_pubkey: [u8; 32],
    pub updated_at: i64,
    pub bump: u8,
}

impl WalletKey {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct SignalRecord {
    pub stream: Pubkey,
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
pub struct StreamState {
    pub stream: Pubkey,
    pub subscription_count: u64,
    pub bump: u8,
}

impl StreamState {
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
pub struct StreamConfig {
    pub stream_id: [u8; 32],
    pub authority: Pubkey,
    pub dao: Pubkey,
    pub tiers_hash: [u8; 32],
    pub visibility: u8,
    pub status: u8,
    pub bump: u8,
}

pub enum StreamStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}

pub enum StreamVisibility {
    Public = 0,
    Private = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TierConfig {
    pub stream: Pubkey,
    pub tier_id: [u8; 32],
    pub pricing_type: u8,
    pub evidence_level: u8,
    pub price_lamports: u64,
    pub quota: u32,
    pub status: u8,
    pub bump: u8,
}

pub enum TierStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Stream account is invalid or not registered")]
    InvalidStream,
    #[msg("Stream is not active")]
    StreamInactive,
    #[msg("Signer is not the stream authority")]
    UnauthorizedStream,
    #[msg("Tier account is invalid or not registered")]
    InvalidTier,
    #[msg("Tier is not active")]
    TierInactive,
    #[msg("Tier configuration does not match")]
    TierMismatch,
    #[msg("Price does not match tier")]
    PriceMismatch,
    #[msg("Treasury account does not match stream registry")]
    InvalidTreasury,
    #[msg("No subscribers exist for this stream")]
    NoSubscribers,
    #[msg("Subscriber ATA does not match expected address")]
    InvalidSubscriberAta,
    #[msg("Subscription is not active")]
    SubscriptionInactive,
    #[msg("Wallet encryption key missing for private stream")]
    WalletKeyMissing,
}

fn require_wallet_key(
    wallet_key: &AccountInfo,
    subscriber: &Signer,
    program_id: &Pubkey,
) -> Result<()> {
    let expected = Pubkey::find_program_address(
        &[b"wallet_key", subscriber.key().as_ref()],
        program_id,
    )
    .0;
    require_keys_eq!(expected, *wallet_key.key, ErrorCode::WalletKeyMissing);
    require_keys_eq!(*wallet_key.owner, *program_id, ErrorCode::WalletKeyMissing);
    let data = wallet_key.data.borrow();
    if data.len() < 8 {
        return Err(error!(ErrorCode::WalletKeyMissing));
    }
    let mut data: &[u8] = &data[8..];
    let decoded = WalletKey::deserialize(&mut data).map_err(|_| error!(ErrorCode::WalletKeyMissing))?;
    require_keys_eq!(decoded.subscriber, subscriber.key(), ErrorCode::WalletKeyMissing);
    Ok(())
}

fn load_stream_config(account: &AccountInfo, registry_program: &AccountInfo) -> Result<StreamConfig> {
    require_keys_eq!(
        *account.owner,
        *registry_program.key,
        ErrorCode::InvalidStream
    );
    let data = account.data.borrow();
    if data.len() < 8 {
        return Err(error!(ErrorCode::InvalidStream));
    }
    let mut data: &[u8] = &data[8..];
    let cfg = StreamConfig::deserialize(&mut data)
        .map_err(|_| error!(ErrorCode::InvalidStream))?;
    Ok(cfg)
}

fn validate_stream(account: &AccountInfo, registry_program: &AccountInfo) -> Result<StreamConfig> {
    let cfg = load_stream_config(account, registry_program)?;
    let expected = Pubkey::find_program_address(
        &[b"stream", cfg.stream_id.as_ref()],
        registry_program.key,
    )
    .0;
    require_keys_eq!(expected, *account.key, ErrorCode::InvalidStream);
    Ok(cfg)
}

fn load_tier_config(account: &AccountInfo, registry_program: &AccountInfo) -> Result<TierConfig> {
    require_keys_eq!(
        *account.owner,
        *registry_program.key,
        ErrorCode::InvalidTier
    );
    let data = account.data.borrow();
    if data.len() < 8 {
        return Err(error!(ErrorCode::InvalidTier));
    }
    let mut data: &[u8] = &data[8..];
    let cfg = TierConfig::deserialize(&mut data)
        .map_err(|_| error!(ErrorCode::InvalidTier))?;
    Ok(cfg)
}

fn validate_tier(
    account: &AccountInfo,
    stream: &AccountInfo,
    tier_id: &[u8; 32],
    registry_program: &AccountInfo,
) -> Result<TierConfig> {
    let cfg = load_tier_config(account, registry_program)?;
    require_keys_eq!(cfg.stream, *stream.key, ErrorCode::TierMismatch);
    require!(cfg.tier_id == *tier_id, ErrorCode::TierMismatch);
    let expected = Pubkey::find_program_address(
        &[b"tier", stream.key().as_ref(), tier_id.as_ref()],
        registry_program.key,
    )
    .0;
    require_keys_eq!(expected, *account.key, ErrorCode::InvalidTier);
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
    fn stream_state_space_constant() {
        assert_eq!(StreamState::SPACE, 49);
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
