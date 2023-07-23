namespace AutoCore.Tools.Commands.GenerateSite;

public static class PageTemplate
{
    public static string Layout { get; } =
        """
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>$(Title)</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" integrity="sha384-b6lVK+yci+bfDmaY1u0zE8YYJt0TZxLEAFyYSLHId4xoVvsrQu3INevFKo+Xir8e" crossorigin="anonymous">
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" integrity="sha384-kenU1KFdBIe4zVF0s0G1M5b4hcpxyD9F7jL+jjXkk+Q2h455rYXK/7HAuoJl+0I4" crossorigin="anonymous"></script>
        </head>
        <body>
        $(NavBar)
        $(Content)
        </body>
        </html>
        """;

    public static string NavbarLayout { get; } =
        """
        <nav>
        </nav>
        """;

    public static string FieldTable { get; } =
        """
        <table>
            <thead>
                <tr>
                    <td>Field</td>
                    <td>Value</td>
                </tr>
            </thead>
            <tbody>
                $(TableRows)
            </tbody>
        </table>
        """;

    public static string FieldRow { get; } =
        """
        <tr>
            <td>$(FieldName)</td>
            <td>$(FieldValue)</td>
        </tr>
        """;
}
