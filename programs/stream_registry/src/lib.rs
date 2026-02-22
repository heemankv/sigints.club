use anchor_lang::prelude::*;

declare_id!("HCm2Bk65hCaevrs4N3oYegMBZBTPpzjoMB44JgTrTVSA");

#[program]
pub mod stream_registry {
    use super::*;

    pub fn create_stream(
        ctx: Context<CreateStream>,
        stream_id: [u8; 32],
        tiers_hash: [u8; 32],
        dao: Pubkey,
    ) -> Result<()> {
        let stream = &mut ctx.accounts.stream;
        stream.stream_id = stream_id;
        stream.authority = ctx.accounts.authority.key();
        stream.dao = dao;
        stream.tiers_hash = tiers_hash;
        stream.status = StreamStatus::Active as u8;
        stream.bump = ctx.bumps.stream;
        Ok(())
    }

    pub fn update_stream(
        ctx: Context<UpdateStream>,
        tiers_hash: [u8; 32],
        status: u8,
    ) -> Result<()> {
        let stream = &mut ctx.accounts.stream;
        stream.tiers_hash = tiers_hash;
        stream.status = status;
        Ok(())
    }

    pub fn set_tiers(ctx: Context<UpdateStream>, tiers_hash: [u8; 32]) -> Result<()> {
        let stream = &mut ctx.accounts.stream;
        stream.tiers_hash = tiers_hash;
        Ok(())
    }

    pub fn upsert_tier(
        ctx: Context<UpsertTier>,
        tier_id: [u8; 32],
        pricing_type: u8,
        evidence_level: u8,
        price_lamports: u64,
        quota: u32,
        status: u8,
    ) -> Result<()> {
        require!(
            pricing_type == PricingType::SubscriptionUnlimited as u8,
            ErrorCode::UnsupportedPricingType
        );
        let tier = &mut ctx.accounts.tier;
        tier.stream = ctx.accounts.stream.key();
        tier.tier_id = tier_id;
        tier.pricing_type = pricing_type;
        tier.evidence_level = evidence_level;
        tier.price_lamports = price_lamports;
        tier.quota = quota;
        tier.status = status;
        tier.bump = ctx.bumps.tier;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(stream_id: [u8; 32])]
pub struct CreateStream<'info> {
    #[account(
        init,
        payer = authority,
        space = StreamConfig::SPACE,
        seeds = [b"stream", stream_id.as_ref()],
        bump
    )]
    pub stream: Account<'info, StreamConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateStream<'info> {
    #[account(mut, has_one = authority)]
    pub stream: Account<'info, StreamConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(tier_id: [u8; 32])]
pub struct UpsertTier<'info> {
    #[account(mut, has_one = authority)]
    pub stream: Account<'info, StreamConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        space = TierConfig::SPACE,
        seeds = [b"tier", stream.key().as_ref(), tier_id.as_ref()],
        bump
    )]
    pub tier: Account<'info, TierConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct StreamConfig {
    pub stream_id: [u8; 32],
    pub authority: Pubkey,
    pub dao: Pubkey,
    pub tiers_hash: [u8; 32],
    pub status: u8,
    pub bump: u8,
}

impl StreamConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 1 + 1;
}

#[account]
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

impl TierConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + 8 + 4 + 1 + 1;
}

pub enum StreamStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}

pub enum TierStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}

pub enum PricingType {
    SubscriptionUnlimited = 1,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Only monthly subscriptions are supported for now")]
    UnsupportedPricingType,
}
