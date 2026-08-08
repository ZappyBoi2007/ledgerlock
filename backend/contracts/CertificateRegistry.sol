// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  CertificateRegistry
 * @notice On-chain registry for academic / professional certificates
 *         whose documents are stored on IPFS and identified by a CID.
 *
 * Roles:
 *   - admin        : deployer; can register institutions.
 *   - institution  : registered by admin; can issue and revoke certificates.
 *
 * NOTE: This is a hackathon prototype. Production use would require
 *       role management, upgradeability, and a more robust key scheme.
 */
contract CertificateRegistry {

    // ─── State ────────────────────────────────────────────────────────────────

    address public admin;

    struct Institution {
        bool   registered;
        string name;
    }

    struct Certificate {
        address issuer;
        string  ipfsCid;
        bool    valid;
        uint256 issuedAt;
    }

    /// @dev institution address → Institution metadata
    mapping(address => Institution) public institutions;

    /// @dev certId (keccak256 hash) → Certificate metadata
    mapping(bytes32 => Certificate) public certificates;

    /// @dev running count of all certificates ever issued (never decremented on revoke)
    uint256 public certificateCount;

    // ─── Events ───────────────────────────────────────────────────────────────

    event InstitutionRegistered(address indexed institution, string name);
    event CertificateIssued(
        bytes32 indexed certId,
        address indexed issuer,
        string          ipfsCid
    );
    event CertificateRevoked(bytes32 indexed certId, address indexed revokedBy);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "CertificateRegistry: caller is not admin");
        _;
    }

    modifier onlyRegistered() {
        require(
            institutions[msg.sender].registered,
            "CertificateRegistry: institution not registered"
        );
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        admin = msg.sender;
    }

    // ─── Admin functions ──────────────────────────────────────────────────────

    /**
     * @notice Register an institution, allowing it to issue certificates.
     * @param institution  Wallet address of the institution.
     * @param name         Human-readable name (e.g. "MIT").
     */
    function registerInstitution(
        address        institution,
        string calldata name
    ) external onlyAdmin {
        require(institution != address(0), "CertificateRegistry: zero address");
        institutions[institution] = Institution({ registered: true, name: name });
        emit InstitutionRegistered(institution, name);
    }

    // ─── Institution functions ────────────────────────────────────────────────

    /**
     * @notice Issue a new certificate anchored to an IPFS CID.
     * @param ipfsCid  IPFS content identifier of the certificate document.
     * @return certId  Unique on-chain identifier (hash) for this certificate.
     */
    function issueCertificate(
        string calldata ipfsCid
    ) external onlyRegistered returns (bytes32 certId) {
        certId = keccak256(
            abi.encodePacked(msg.sender, ipfsCid, block.timestamp, certificateCount)
        );
        certificates[certId] = Certificate({
            issuer:   msg.sender,
            ipfsCid:  ipfsCid,
            valid:    true,
            issuedAt: block.timestamp
        });
        certificateCount++;
        emit CertificateIssued(certId, msg.sender, ipfsCid);
    }

    /**
     * @notice Revoke a certificate. Only the original issuing institution may revoke.
     * @param certId  The certificate identifier to revoke.
     */
    function revokeCertificate(bytes32 certId) external {
        require(
            certificates[certId].issuer == msg.sender,
            "CertificateRegistry: caller is not the issuing institution"
        );
        certificates[certId].valid = false;
        emit CertificateRevoked(certId, msg.sender);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Verify a certificate's current status.
     * @param certId   Certificate identifier.
     * @return valid    True if the certificate has not been revoked.
     * @return issuer   Address of the institution that issued it.
     * @return ipfsCid  IPFS CID of the backing document.
     */
    function verifyCertificate(bytes32 certId)
        external
        view
        returns (bool valid, address issuer, string memory ipfsCid)
    {
        Certificate storage cert = certificates[certId];
        return (cert.valid, cert.issuer, cert.ipfsCid);
    }
}
