namespace InvAgent.Models;

public class UpdateInfo
{
    public string LatestVersion { get; set; } = "";
    public string UpdateUrl { get; set; } = "";
    public string Checksum { get; set; } = "";
    public int FileSize { get; set; }
}
