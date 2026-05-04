export interface Update2FaGetQueryInterface {
    secret: string;
    email_verified: boolean;
}

export interface Update2FaPatchQueryInterface {
    two_factor_enabled: boolean;
}