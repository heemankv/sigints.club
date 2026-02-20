use anchor_lang::prelude::*;

declare_id!("5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi");

#[program]
pub mod persona_registry {
    use super::*;

    pub fn create_persona(
        ctx: Context<CreatePersona>,
        persona_id: [u8; 32],
        tiers_hash: [u8; 32],
        dao: Pubkey,
    ) -> Result<()> {
        let persona = &mut ctx.accounts.persona;
        persona.persona_id = persona_id;
        persona.authority = ctx.accounts.authority.key();
        persona.dao = dao;
        persona.tiers_hash = tiers_hash;
        persona.status = PersonaStatus::Active as u8;
        persona.bump = ctx.bumps.persona;
        Ok(())
    }

    pub fn update_persona(
        ctx: Context<UpdatePersona>,
        tiers_hash: [u8; 32],
        status: u8,
    ) -> Result<()> {
        let persona = &mut ctx.accounts.persona;
        persona.tiers_hash = tiers_hash;
        persona.status = status;
        Ok(())
    }

    pub fn set_tiers(ctx: Context<UpdatePersona>, tiers_hash: [u8; 32]) -> Result<()> {
        let persona = &mut ctx.accounts.persona;
        persona.tiers_hash = tiers_hash;
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
        let tier = &mut ctx.accounts.tier;
        tier.persona = ctx.accounts.persona.key();
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
#[instruction(persona_id: [u8; 32])]
pub struct CreatePersona<'info> {
    #[account(
        init,
        payer = authority,
        space = PersonaConfig::SPACE,
        seeds = [b"persona", persona_id.as_ref()],
        bump
    )]
    pub persona: Account<'info, PersonaConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePersona<'info> {
    #[account(mut, has_one = authority)]
    pub persona: Account<'info, PersonaConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(tier_id: [u8; 32])]
pub struct UpsertTier<'info> {
    #[account(mut, has_one = authority)]
    pub persona: Account<'info, PersonaConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        space = TierConfig::SPACE,
        seeds = [b"tier", persona.key().as_ref(), tier_id.as_ref()],
        bump
    )]
    pub tier: Account<'info, TierConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PersonaConfig {
    pub persona_id: [u8; 32],
    pub authority: Pubkey,
    pub dao: Pubkey,
    pub tiers_hash: [u8; 32],
    pub status: u8,
    pub bump: u8,
}

impl PersonaConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 1 + 1;
}

#[account]
pub struct TierConfig {
    pub persona: Pubkey,
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

pub enum PersonaStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}

pub enum TierStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}
