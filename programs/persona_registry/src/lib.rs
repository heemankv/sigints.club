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

pub enum PersonaStatus {
    Inactive = 0,
    Active = 1,
    Paused = 2,
}
