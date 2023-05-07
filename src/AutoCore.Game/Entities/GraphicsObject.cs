namespace AutoCore.Game.Entities;

public enum GraphicsObjectType
{
    GraphicsPhysics,
    Graphics
}

public abstract class GraphicsObject : ClonedObjectBase
{
    public GraphicsObjectType ObjectType { get; }

    public GraphicsObject(GraphicsObjectType objectType)
    {
        ObjectType = objectType;
    }
}
