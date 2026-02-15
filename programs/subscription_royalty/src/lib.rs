use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};
use anchor_spl::token::spl_token::instruction::AuthorityType;

declare_id!("BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE");

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

        let persona_key = ctx.accounts.persona.key();
        let subscriber_key = ctx.accounts.subscriber.key();
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
        Ok(())
    }

    pub fn cancel(ctx: Context<Renew>) -> Result<()> {
        let sub = &mut ctx.accounts.subscription;
        sub.status = SubscriptionStatus::Canceled as u8;
        Ok(())
    }

    pub fn record_signal(
        ctx: Context<RecordSignal>,
        signal_hash: [u8; 32],
        signal_pointer_hash: [u8; 32],
        keybox_hash: [u8; 32],
        keybox_pointer_hash: [u8; 32],
    ) -> Result<()> {
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
    pub subscription: Account<'info, Subscription>,
    #[account(
        init,
        payer = subscriber,
        seeds = [b"subscription_mint", persona.key().as_ref(), subscriber.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = subscription,
        mint::freeze_authority = subscription,
    )]
    pub subscription_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = subscriber,
        associated_token::mint = subscription_mint,
        associated_token::authority = subscriber,
    )]
    pub subscriber_ata: Account<'info, TokenAccount>,
    /// CHECK: persona is validated off-chain in MVP
    pub persona: UncheckedAccount<'info>,
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
    pub subscriber: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(signal_hash: [u8; 32])]
pub struct RecordSignal<'info> {
    #[account(
        init,
        payer = payer,
        space = SignalRecord::SPACE,
        seeds = [b"signal", persona.key().as_ref(), &signal_hash],
        bump
    )]
    pub signal: Account<'info, SignalRecord>,
    /// CHECK: persona is validated off-chain in MVP
    pub persona: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
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

pub enum PricingType {
    SubscriptionLimited = 0,
    SubscriptionUnlimited = 1,
    PerSignal = 2,
}

pub enum EvidenceLevel {
    Trust = 0,
    Verifier = 1,
}

pub enum SubscriptionStatus {
    Active = 0,
    Canceled = 1,
    Expired = 2,
}
