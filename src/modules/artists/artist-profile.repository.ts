import { ArtistProfile } from './artist-profile.model';

export interface ProfileSummary {
  displayName: string;
  category: string;
}

export async function findSummaryByUserId(userId: number): Promise<ProfileSummary | null> {
  return ArtistProfile.findOne({ userId })
    .select('displayName category -_id')
    .lean<ProfileSummary>();
}
