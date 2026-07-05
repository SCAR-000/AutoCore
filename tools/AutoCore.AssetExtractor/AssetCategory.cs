namespace AutoCore.AssetExtractor;

public static class AssetCategory
{
    private static readonly Dictionary<string, string> ExtensionMap =
        new(StringComparer.OrdinalIgnoreCase)
    {
        // audio
        [".wav"]   = "audio",    [".ogg"]  = "audio",    [".mp3"]   = "audio",   [".sfx"]  = "audio",
        // textures
        [".png"]   = "textures", [".jpg"]  = "textures", [".jpeg"]  = "textures",
        [".bmp"]   = "textures", [".dds"]  = "textures", [".tga"]   = "textures", [".gif"] = "textures",
        // models — AA uses .geo (not .dts), with .geo01 etc. for LODs
        [".geo"]   = "models",   [".dts"]  = "models",
        [".geo01"] = "models",   [".geo02"] = "models",  [".geo03"] = "models",
        // animations — AA uses .anm (not .dsq)
        [".anm"]   = "animations", [".dsq"] = "animations",
        // interiors / terrains / maps
        [".dif"]   = "interiors",
        [".ter"]   = "terrains",
        [".fam"]   = "maps",     [".mis"]  = "maps",
        // scripts — .tk is AA's compiled TorqueScript
        [".cs"]    = "scripts",  [".gui"]  = "scripts",  [".tk"]   = "scripts",  [".spt"]  = "scripts",
        // data
        [".xml"]   = "data",     [".csv"]  = "data",     [".txt"]  = "data",
        [".ini"]   = "data",     [".xsl"]  = "data",     [".cfg"]  = "data",     [".cat"]  = "data",
        // shaders — .sha=shader asm, .tec=technique, .fxh=fx header, .fxi=fx instance, .pgm=program
        [".hlsl"]  = "shaders",  [".glsl"] = "shaders",
        [".vs"]    = "shaders",  [".ps"]   = "shaders",  [".fx"]   = "shaders",
        [".sha"]   = "shaders",  [".tec"]  = "shaders",  [".fxh"]  = "shaders",  [".fxi"]  = "shaders",
        [".pgm"]   = "shaders",
        // fonts
        [".fnt"]   = "fonts",    [".ttf"]  = "fonts",
        // physics cache
        [".cache"] = "physics",
    };

    public static string GetCategory(string entryName)
    {
        var ext = Path.GetExtension(entryName);
        return ExtensionMap.TryGetValue(ext, out var cat) ? cat : "other";
    }
}
