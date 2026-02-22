use anchor_lang::prelude::*;

declare_id!("DqQjh7bT9sri2fnZqh58nEpzeJb7jZaCNzb4CMGNqbEP");

#[program]
pub mod challenge_slashing {
    use super::*;

    pub fn open_challenge(
        ctx: Context<OpenChallenge>,
        signal_hash: [u8; 32],
        created_at: i64,
    ) -> Result<()> {
        let ch = &mut ctx.accounts.challenge;
        ch.stream = ctx.accounts.stream.key();
        ch.challenger = ctx.accounts.challenger.key();
        ch.signal_hash = signal_hash;
        ch.status = ChallengeStatus::Open as u8;
        ch.created_at = created_at;
        ch.resolved_at = 0;
        ch.bump = ctx.bumps.challenge;
        Ok(())
    }

    pub fn resolve_challenge(
        ctx: Context<ResolveChallenge>,
        status: u8,
        resolved_at: i64,
    ) -> Result<()> {
        let ch = &mut ctx.accounts.challenge;
        ch.status = status;
        ch.resolved_at = resolved_at;
        Ok(())
    }

    pub fn slash_and_refund(ctx: Context<ResolveChallenge>) -> Result<()> {
        let ch = &mut ctx.accounts.challenge;
        ch.status = ChallengeStatus::Slashed as u8;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(signal_hash: [u8; 32])]
pub struct OpenChallenge<'info> {
    #[account(
        init,
        payer = challenger,
        space = Challenge::SPACE,
        seeds = [b"challenge", stream.key().as_ref(), &signal_hash, challenger.key().as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    /// CHECK: stream is validated off-chain in MVP
    pub stream: UncheckedAccount<'info>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveChallenge<'info> {
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
    pub resolver: Signer<'info>,
}

#[account]
pub struct Challenge {
    pub stream: Pubkey,
    pub challenger: Pubkey,
    pub signal_hash: [u8; 32],
    pub status: u8,
    pub created_at: i64,
    pub resolved_at: i64,
    pub bump: u8,
}

impl Challenge {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 8 + 8 + 1;
}

pub enum ChallengeStatus {
    Open = 0,
    Rejected = 1,
    Accepted = 2,
    Slashed = 3,
}
