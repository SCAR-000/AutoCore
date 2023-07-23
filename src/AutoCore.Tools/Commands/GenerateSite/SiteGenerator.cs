using System.Text;

using Slugify;

namespace AutoCore.Tools.Commands.GenerateSite;

public static class SiteGenerator
{
    public static bool Generate(string outputPath, DataContainer container)
    {
        // index.html

        if (!GenerateMissions(Path.Combine(outputPath, "mission"), container))
        {
            Console.WriteLine("Error while generating mission HTMLs!");
            return false;
        }

        return false;
    }

    private static bool GenerateMissions(string outputPath, DataContainer container)
    {
        var helper = new SlugHelper();

        Directory.CreateDirectory(outputPath);

        foreach (var mission in container.Missions)
        {
            var filePath = Path.Combine(outputPath, $"{mission.Id}-{helper.GenerateSlug(mission.Title)}.html");

            var tableBuilder = new StringBuilder();

            AppendField(tableBuilder, "Id", mission.Id);
            AppendField(tableBuilder, "Title", mission.Title);
            AppendField(tableBuilder, "Name", mission.Name);
            AppendField(tableBuilder, "Type", mission.Type); // TODO: mapping
            AppendField(tableBuilder, "Priority", mission.Priority);
            AppendField(tableBuilder, "Required Race", mission.ReqRace); // TODO: mapping, hide if -1, link
            AppendField(tableBuilder, "Required Class", mission.ReqClass); // TODO: mapping, hide if -1, link
            AppendField(tableBuilder, "Required Level Min", mission.ReqLevelMin);
            AppendField(tableBuilder, "Required Level Max", mission.ReqLevelMax);

            for (var i = 0; i < 4; ++i)
                if (mission.ReqMissionId[i] != -1)
                    AppendField(tableBuilder, $"Required Mission {i+1}", mission.ReqMissionId[i]); // TODO: link

            var pageContent = new StringBuilder(PageTemplate.Layout);
            pageContent.Replace("$(Title)", mission.Title);
            pageContent.Replace("$(Content)", PageTemplate.FieldTable);
            pageContent.Replace("$(TableRows)", tableBuilder.ToString());

            File.WriteAllText(filePath, pageContent.ToString());
        }

        return true;
    }

    private static void AppendField(StringBuilder builder, string field, object value)
    {
        builder.AppendLine(PageTemplate.FieldRow);
        builder.Replace("$(FieldName)", field);
        builder.Replace("$(FieldValue)", value.ToString());
    }
}
